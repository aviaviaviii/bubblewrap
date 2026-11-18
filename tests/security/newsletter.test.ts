// newsletter/apps-script.gs runs in Google Apps Script, not Node, so it's loaded into a
// sandbox with stand-ins for SpreadsheetApp, LockService and ContentService.
// Covers the honeypot, email checks, duplicates, the lock and first-run sheet setup.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("newsletter/apps-script.gs", "utf8");

function sandbox({ existingSheet = true } = {}) {
  const rows: unknown[][] = existingSheet ? [["signed up", "email", "page"]] : [];
  let sheetExists = existingSheet;
  const lock = { waited: 0, released: 0 };
  const sheet = {
    frozen: 0,
    getLastRow: () => rows.length,
    getRange: (r: number, c: number, n: number) => ({ getValues: () => rows.slice(r - 1, r - 1 + n).map((row) => [row[c - 1]]) }),
    appendRow: (row: unknown[]) => rows.push(row),
    setFrozenRows: (n: number) => (sheet.frozen = n),
  };
  const ctx: Record<string, any> = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => (sheetExists && name === "signups" ? sheet : null),
        insertSheet: (name: string) => {
          expect(name).toBe("signups");
          sheetExists = true;
          return sheet;
        },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => lock.waited++, releaseLock: () => lock.released++ }) },
    ContentService: {
      MimeType: { TEXT: "text/plain" },
      createTextOutput: (t: string) => ({ text: t, setMimeType(m: string) { return { text: t, mime: m }; } }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const post = (parameter: Record<string, string>) => ctx.doPost({ parameter });
  return { ctx, rows, sheet, lock, post };
}

let s: ReturnType<typeof sandbox>;
beforeEach(() => (s = sandbox()));

describe("newsletter Apps Script", () => {
  it("GET says it's open", () => {
    expect(s.ctx.doGet()).toEqual({ text: "bubblewrap signups are open", mime: "text/plain" });
  });

  it("adds a signup with the time, the lowercased email and the page", () => {
    expect(s.post({ email: "  Reader@Example.COM ", page: "/live" }).text).toBe("ok");
    expect(s.rows).toHaveLength(2);
    const [time, email, page] = s.rows[1];
    expect(Object.prototype.toString.call(time)).toBe("[object Date]"); // made in the sandbox, so not instanceof Date
    expect([email, page]).toEqual(["reader@example.com", "/live"]);
  });

  it("skips duplicates, whatever their case", () => {
    s.post({ email: "a@b.co" });
    s.post({ email: "A@B.CO" });
    expect(s.rows).toHaveLength(2);
  });

  it("ignores bots that fill the honeypot, and still answers ok", () => {
    expect(s.post({ email: "bot@spam.co", website: "http://spam" }).text).toBe("ok");
    expect(s.rows).toHaveLength(1);
  });

  it.each(["", "no-at-sign", "a@b", "a b@c.de", "@b.co", "a@"])("refuses %j", (email) => {
    expect(s.post({ email }).text).toBe("invalid email");
    expect(s.rows).toHaveLength(1);
  });

  it("refuses emails over 254 characters", () => {
    expect(s.post({ email: `${"a".repeat(250)}@b.co` }).text).toBe("invalid email");
  });

  it("cuts the page field to 200 characters", () => {
    s.post({ email: "a@b.co", page: "/".repeat(500) });
    expect(String(s.rows[1][2])).toHaveLength(200);
  });

  it("takes the lock and always releases it", () => {
    s.post({ email: "a@b.co" });
    expect(s.lock).toEqual({ waited: 1, released: 1 });
  });

  it("releases the lock even if the sheet throws", () => {
    s.sheet.appendRow = () => {
      throw new Error("quota");
    };
    expect(() => s.post({ email: "a@b.co" })).toThrow("quota");
    expect(s.lock.released).toBe(1);
  });

  it("creates the signups tab with headers on the first signup", () => {
    s = sandbox({ existingSheet: false });
    s.post({ email: "first@b.co" });
    expect(s.rows[0]).toEqual(["signed up", "email", "page"]);
    expect(s.rows[1][1]).toBe("first@b.co");
    expect(s.sheet.frozen).toBe(1);
  });

  it("copes with a request that has no parameters", () => {
    expect(s.ctx.doPost(undefined).text).toBe("invalid email");
  });
});
