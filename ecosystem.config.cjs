module.exports = {
  apps: [
    {
      name: 'aura-voice-agent',
      script: './server.mjs',
      instances: 1, // Single-instance persistent architecture
      autorestart: true,
      watch: false,
      max_memory_restart: '16G',
      out_file: '/dev/stdout',
      error_file: '/dev/stderr',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        AURA_PERSISTENCE_TOPOLOGY: 'SINGLE_INSTANCE',
      },
      node_args: '--max-semi-space-size=512 --max-old-space-size=16384 --expose-gc',
    },
  ],
};
