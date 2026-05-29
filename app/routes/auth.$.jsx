import { authenticate } from "../shopify.server";

import { redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  return redirect(`/app?shop=${shop}`);
};
