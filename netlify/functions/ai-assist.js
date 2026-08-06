// netlify/functions/ai-assist.js
//
// Đây là "cầu nối" an toàn giữa app Kiên Thịnh Quote và Claude API.
// API key được lưu trong biến môi trường của Netlify (ANTHROPIC_API_KEY),
// KHÔNG BAO GIỜ xuất hiện trong code trình duyệt / mã nguồn trang web.
//
// Cách deploy: xem file AI_ASSISTANT_SETUP.md đi kèm.

exports.handler = async function (event) {
  // Cho phép gọi từ trình duyệt (CORS)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Trình duyệt gửi request "dò đường" (preflight) trước khi POST thật
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Chỉ hỗ trợ phương thức POST' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Chưa cấu hình ANTHROPIC_API_KEY trên Netlify. Xem hướng dẫn AI_ASSISTANT_SETUP.md',
      }),
    };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = (body.prompt || '').trim();
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Dữ liệu gửi lên không hợp lệ' }) };
  }

  if (!prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Thiếu nội dung prompt' }) };
  }

  // Giới hạn độ dài để tránh lạm dụng / phát sinh chi phí bất thường
  if (prompt.length > 6000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nội dung quá dài (tối đa 6000 ký tự)' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system:
          'Bạn là trợ lý hỗ trợ nhân viên kinh doanh thiết bị đo lường, phân tích môi trường và giải pháp quan trắc môi trường tự động. Trả lời bằng tiếng Việt, ngắn gọn, chuyên nghiệp, đúng trọng tâm yêu cầu. Chỉ trả về nội dung được yêu cầu, không thêm lời dẫn hay giải thích thừa.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Lỗi khi gọi AI (mã ' + res.status + ')' }),
      };
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: text || '(AI không trả về nội dung)' }),
    };
  } catch (err) {
    console.error('ai-assist function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Lỗi máy chủ: ' + (err.message || 'không xác định') }),
    };
  }
};
