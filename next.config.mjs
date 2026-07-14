/** @type {import('next').NextConfig} */
const noStoreHeaders = [
	{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
	{ key: "Pragma", value: "no-cache" },
	{ key: "Expires", value: "0" },
	{ key: "Surrogate-Control", value: "no-store" }
];

const nextConfig = {
	devIndicators: false,
	async headers() {
		return [
			{
				source: "/control-panel/:path*",
				headers: noStoreHeaders
			},
			{
				source: "/api/admin/:path*",
				headers: noStoreHeaders
			},
			{
				source: "/api/session/:path*",
				headers: noStoreHeaders
			}
		];
	}
};

export default nextConfig;
