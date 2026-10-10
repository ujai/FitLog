import { auth } from "@/lib/auth";

export const { GET, POST } = {
  GET: auth.handler,
  POST: auth.handler,
};
