async page => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JQv4AAAAASUVORK5CYII=';
  const response = await page.evaluate(async ({ png }) => {
    const r = await fetch('/api/ai/system/8QT7iWQCd9A_VE3o3U8T4/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vozeb-pro-logical-model': 'gpt-4o',
        'idempotency-key': `canvas-vision-probe-${Date.now()}`,
        'x-client-request-id': `canvas-vision-probe-${Date.now()}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Reply with exactly VISION_OK if you can receive the image.' },
          { type: 'image_url', image_url: { url: png } }
        ] }],
        max_tokens: 12
      })
    });
    return { status: r.status, body: await r.text() };
  }, { png });
  return response;
}
