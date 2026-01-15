const fastify = require('./sia-api');

// Root endpoint
fastify.get('/', async (request, reply) => {
  return {
    message: 'SIA DC-09 API Server',
    version: '1.0.0',
    alarm24: {
      host: '213.167.121.142',
      port: 12004,
      account: '555555'
    },
    endpoints: {
      health: 'GET /health',
      config: 'GET /api/sia/config',
      alarm24Test: 'POST /api/sia/alarm24/test',
      alarm24Send: 'POST /api/sia/alarm24/send',
      plainMessage: 'POST /api/sia/plain',
      encryptedMessage: 'POST /api/sia/encrypted',
      demo: 'POST /api/sia/demo'
    }
  };
});

const start = async () => {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 SIA DC-09 API Server running on http://${HOST}:${PORT}`);
    console.log(`\n📡 Alarm24 Settings:`);
    console.log(`   Host:     213.167.121.142`);
    console.log(`   Port:     12004`);
    console.log(`   Account:  555555`);
    console.log(`📚 API Endpoints:`);
    console.log(`   GET  /health              - Health check`);
    console.log(`   GET  /api/sia/config      - Get configuration`);
    console.log(`   POST /api/sia/alarm24/test - Quick test to Alarm24`);
    console.log(`   POST /api/sia/alarm24/send - Send alarm to Alarm24`);
    console.log(`   POST /api/sia/plain       - Send plain message`);
    console.log(`   POST /api/sia/encrypted   - Send encrypted message`);
    console.log(`   POST /api/sia/demo        - Generate demo messages\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
