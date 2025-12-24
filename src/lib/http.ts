import axios from "axios";
import { getToken } from "./auth";

export const http = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
    timeout: 15000,
});

http.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
