const KEY = "agent_portal_token";

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(KEY);
}

export function setToken(token: string) {
    localStorage.setItem(KEY, token);
    document.cookie = `agent_portal_token=${token}; path=/;`;
}

export function clearToken() {
    localStorage.removeItem(KEY);
    document.cookie = "agent_portal_token=; Max-Age=0; path=/;";
}
