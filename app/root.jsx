import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/@shopify/polaris@latest/build/esm/styles.css"
        />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <html>
      <head>
        <title>Error</title>
      </head>
      <body>
        <h1>Root ErrorBoundary</h1>
        <pre>{error instanceof Error ? error.stack : JSON.stringify(error)}</pre>
      </body>
    </html>
  );
}
