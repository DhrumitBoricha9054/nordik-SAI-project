const fastify = require('./sia-api');

// Root endpoint
fastify.get('/', async (request, reply) => {
  return { 
    message: 'SIA DC-09 API Server',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      plainMessage: 'POST /api/sia/plain',
      encryptedMessage: 'POST /api/sia/encrypted',
      analyzeMessage: 'GET /api/sia/message/analyze',
      demo: 'POST /api/sia/demo'
    },
    documentation: 'See README.md for API documentation'
  };
});

const start = async () => {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 SIA DC-09 API Server running on http://${HOST}:${PORT}`);
    console.log(`📚 API Documentation:`);
    console.log(`   GET  /health - Health check`);
    console.log(`   POST /api/sia/plain - Send non-encrypted message`);
    console.log(`   POST /api/sia/encrypted - Send encrypted message`);
    console.log(`   GET  /api/sia/message/analyze - Analyze message`);
    console.log(`   POST /api/sia/demo - Generate demo messages\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
