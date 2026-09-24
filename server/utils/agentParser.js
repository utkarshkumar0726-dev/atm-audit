function parseUserAgent(ua = '') {
  const agent = String(ua).toLowerCase();

  let device = 'Desktop';
  if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(agent)) {
    device = /tablet|ipad/i.test(agent) ? 'Tablet' : 'Mobile';
  }

  let browser = 'Browser';
  if (agent.includes('edg/')) {
    browser = 'Edge';
  } else if (agent.includes('chrome/') && !agent.includes('chromium')) {
    browser = 'Chrome';
  } else if (agent.includes('safari/') && !agent.includes('chrome')) {
    browser = 'Safari';
  } else if (agent.includes('firefox/')) {
    browser = 'Firefox';
  } else if (agent.includes('opera/') || agent.includes('opr/')) {
    browser = 'Opera';
  }

  return { device, browser };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

module.exports = {
  parseUserAgent,
  getClientIp,
};
