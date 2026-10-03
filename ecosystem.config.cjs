module.exports = {
  apps: [
    {
      name: 'aura-voice-agent',
      script: './server.mjs',
      instances: 1, // Strict single-instance persistent architecture
      autorestart: true,
      watch: false,
      max_memory_restart: '16G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        AURA_ACK_MULTI_INSTANCE_PERSISTENCE: 'true',
      },
      node_args: '--max-semi-space-size=512 --max-old-space-size=16384 --expose-gc',
    },
  ],
};
