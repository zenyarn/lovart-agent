export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (response.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Force a fresh document after session expiry to discard authenticated client state.
    window.location.assign(
      `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    );
    throw new Error("登录已过期，请重新登录");
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "请求失败"), {
      status: response.status,
    });
  return data;
}
