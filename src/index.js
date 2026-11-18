// Paste this script into a Cloudflare Worker with a Workers AI binding named AI.
// The endpoint accepts the existing site's {prompt} JSON and returns {response}.
const allowedOrigins = new Set([
  'https://wtttt-t-flashlight-script-ai.hf.space',
  'https://huggingface.co',
  'https://wtt0423.github.io',
  'https://flashlight.wtt73049.workers.dev'
]);
const model = '@cf/google/gemma-4-26b-a4b-it';
function reply(data, status, origin) {
  const headers = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'};
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return new Response(JSON.stringify(data), {status, headers});
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') {
      return reply({status:'ok', model, revision:'4'}, 200, origin);
    }
    if (path !== '/api/generate') return reply({error:'Not found'}, 404, origin);
    if (origin && !allowedOrigins.has(origin)) return reply({error:'Origin not allowed'}, 403, origin);
    if (request.method === 'OPTIONS') return new Response(null, {
      status:204, headers: {
        'Access-Control-Allow-Origin':origin || '',
        'Access-Control-Allow-Methods':'POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type',
        'Access-Control-Max-Age':'86400',
        'Vary':'Origin'
      }
    });
    if (request.method !== 'POST') return reply({error:'Use POST'}, 405, origin);
    if (!env.AI) return reply({error:'Missing Workers AI binding named AI'}, 503, origin);
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > 12000) return reply({error:'Request too large'}, 413, origin);
    let body;
    try { body = await request.json(); } catch { return reply({error:'Invalid JSON'}, 400, origin); }
    const prompt = body?.prompt;
    if (typeof prompt !== 'string' || prompt.length < 20 || prompt.length > 4000)
      return reply({error:'Prompt length must be 20-4000 characters'}, 400, origin);
    try {
      const answer = await env.AI.run(model, {
        messages: [
          {role:'system', content:'你是美国 TikTok 手电筒短视频编剧。请严格输出两段：一、中文分镜剧本（每段明确起止秒数、机位、动作、光效、声音）；二、完整中文 Seedance 视频提示词（人物、场景、产品外观、两种独立光效、逐秒镜头、英文口播、BGM、负面约束）。除英文口播原句和 Wide Flood、Focused Beam、Seedance 外，全部用中文；禁止用英文写镜头或提示词，禁止 Scene、Subject、Camera、Text Overlay。无字幕、无画面文字、无水印、无棚拍灯光、无尾盖开关或尾盖发光。产品按钮位置仅按用户输入，泛光和聚焦切换时前一模式完全消失。剧情动作符合物理逻辑，不虚构功能，避免悬疑或夸张情节。务必写完整结尾，不输出表格、分析或思考过程。'},
          {role:'user', content:prompt}
        ],
        max_completion_tokens:3800,
        temperature:0.7
      });
      const response = answer?.choices?.[0]?.message?.content ?? answer?.response ?? '';
      const finishReason = answer?.choices?.[0]?.finish_reason;
      if (finishReason === 'length') return reply({error:'生成内容超出模型输出上限，请缩短剧情需求后重试。'}, 502, origin);
      if (!response) return reply({error:'Model returned no text'}, 502, origin);
      return reply({response}, 200, origin);
    } catch (e) {
      const message = String(e?.message || '');
      const quota = /quota|limit|exceed|429|3040/i.test(message);
      return reply({error:quota?'AI 免费额度或并发已满，请稍后再试。':'AI 暂时不可用，请稍后再试。'}, quota?429:502, origin);
    }
  }
};
