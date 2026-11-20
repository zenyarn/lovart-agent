import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicAddress } from "./security";
type Address = { address: string; family: number };
type Lookup = (host: string) => Promise<Address[]>;
/** TUN proxies may return RFC 2544 fake IPs. Resolve only those hostnames again via a fixed HTTPS DNS service, then validate and pin the actual public IP. */
export async function resolvePublicHost(
  host: string,
  resolve: Lookup = (h) => lookup(h, { all: true }),
  fetcher: typeof fetch = fetch,
): Promise<Address> {
  let addresses = await resolve(host);
  const fakeOnly =
    addresses.length > 0 &&
    addresses.every((a) => /^198\.(18|19)\./.test(a.address));
  if (fakeOnly && !isIP(host)) {
    const endpoint = new URL("https://dns.google/resolve");
    endpoint.searchParams.set("name", host);
    endpoint.searchParams.set("type", "A");
    const response = await fetcher(endpoint, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("公共 DNS 查询失败");
    const answer = await response.json();
    if (answer.Status !== 0 || !Array.isArray(answer.Answer))
      throw new Error("公共 DNS 无有效结果");
    addresses = answer.Answer.filter((a: { type: number }) => a.type === 1).map(
      (a: { data: string }) => ({ address: a.data, family: 4 }),
    );
  }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("结果地址不允许访问");
  return addresses[0];
}
