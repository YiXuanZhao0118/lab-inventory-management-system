// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 其他設定...
  allowedDevOrigins: [
    '172.30.10.16',     // 允許你的區網 IP
    '*.my-local-domain', // 允許某個本地網域（可選）
  ],
};

module.exports = nextConfig;
