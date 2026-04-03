/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  webpack: (config) => {
    config.module.rules.push({
      test: /\.obj$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
