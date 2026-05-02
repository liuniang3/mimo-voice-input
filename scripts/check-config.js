const hasKey = Boolean(process.env.MIMO_API_KEY);
const key = process.env.MIMO_API_KEY || "";
const baseUrl = process.env.MIMO_BASE_URL
  || (key.startsWith("tp-") ? "https://token-plan-cn.xiaomimimo.com/v1" : "https://api.xiaomimimo.com/v1");

console.log(`MIMO_API_KEY: ${hasKey ? "configured" : "missing"}`);
console.log(`MIMO key kind: ${key.startsWith("tp-") ? "token-plan" : "regular-or-missing"}`);
console.log(`MIMO base URL: ${baseUrl}`);
console.log(`Node: ${process.version}`);

if (!hasKey) {
  process.exitCode = 1;
}
