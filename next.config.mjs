import withPWA from "next-pwa";

const isProd = process.env.NODE_ENV === "production";

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: !isProd,
  runtimeCaching: [
    // cache básico; ajuste se precisar de estratégias específicas
  ],
})({
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
});
