import { login } from "../shopify.server";

export const loader = async ({ request }) => {
  await login(request);
  return null;
};
