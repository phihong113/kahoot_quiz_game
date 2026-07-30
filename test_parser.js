const rawText = `"[ { "questionText": "Theo phần Tri thức Ngữ văn bài 4, thời gian trong sử thi thường mang đặc điểm gì?", "options": [ "Thời gian hiện tại, gắn với cuộc sống sinh hoạt đời thường của con người.", "Thời gian quá khứ thiêng liêng, thuộc về một thời đại xa xưa được cộng đồng ngưỡng vọng.", "Thời gian tương lai, thể hiện ước mơ và khát vọng vươn tới cái đẹp của tác giả.", "Thời gian tuần hoàn theo các mùa trong năm, lặp đi lặp lại một cách tuần hoàn." ], "correctIndex": 1, "timeLimit": 20, "explanation": "Không gian và thời gian trong sử thi rất đặc biệt, trong đó thời gian sử thi là quá khứ thiêng liêng, thuộc về một thời đại xa xưa được cộng đồng ngưỡng vọng." }, { "questionText": "Trong đoạn trích "Héc-to từ biệt Ăng-đrô-mác", lí do chính khiến Héc-to quyết định vẫn ra trận dù biết trước cái chết và sự đau khổ của vợ con là gì?", "options": [ "Vì chàng muốn tranh giành quyền lực cai trị thành Tơ-roa với A-khin.", "Vì chàng bị các vị thần trên đỉnh Ô-lim-pơ ép buộc phải tham gia chiến trận.", "Vì lòng kiêu hãnh, bổn phận của một người chiến binh và trách nhiệm bảo vệ thành Tơ-roa.", "Vì chàng muốn tìm kiếm sự giàu có, chiến lợi phẩm và vinh quang cho cá nhân mình." ], "correctIndex": 2, "timeLimit": 30, "explanation": "Héc-to quyết định ra trận vì bầu nhiệt huyết không cho phép chàng lẩn tránh, cùng với lòng kiêu hãnh và bổn phận bảo vệ quê hương, đồng bào." }, { "questionText": "Trong đoạn trích "Đăm Săn đi bắt Nữ Thần Mặt Trời", mục đích chính của Đăm Săn khi vượt qua bao gian nan đến nhà Nữ Thần Mặt Trời là gì?", "options": [ "Để cầu xin Nữ Thần ban cho bộ tộc ánh sáng, sự ấm áp và mùa màng tươi tốt.", "Để thách đấu và chứng tỏ sức mạnh vô địch của mình trước thần linh.", "Để bắt Nữ Thần Mặt Trời về làm vợ lẽ (vợ hai) của mình.", "Để tìm kiếm phương thuốc trường sinh bất tử cho bản thân và dân làng." ], "correctIndex": 2, "timeLimit": 20, "explanation": "Đăm Săn đã cất công đến tận nhà Nữ Thần Mặt Trời ngỏ lời muốn bắt nàng về làm vợ lẽ (vợ hai) của mình để thêm uy quyền." }, { "questionText": "Theo phần Thực hành tiếng Việt, trích dẫn gián tiếp trong văn bản được hiểu như thế nào là chính xác nhất?", "options": [ "Là đưa nguyên văn một phần câu, một câu, hoặc một đoạn văn vào bài viết và đặt trong ngoặc kép.", "Là sử dụng ý tưởng của người khác và diễn đạt lại theo cách của mình nhưng vẫn trung thành với ý tưởng gốc.", "Là việc tự do phóng tác và thay đổi hoàn toàn ý nghĩa câu nói của người khác để phù hợp với bài viết.", "Là việc lược bỏ toàn bộ tên tác giả và nguồn tài liệu khi đưa thông tin vào trong văn bản của mình." ], "correctIndex": 1, "timeLimit": 30, "explanation": "Trích dẫn gián tiếp là diễn đạt lại ý tưởng của người khác theo ngôn từ của mình nhưng phải đảm bảo trung thành tuyệt đối với ý tưởng gốc." }, { "questionText": "Khi viết một bản báo cáo nghiên cứu về một vấn đề văn học, phần "Kết luận" của bài báo cáo có nhiệm vụ gì?", "options": [ "Nêu lí do chọn đề tài, giới thiệu vấn đề nghiên cứu và xác định phương pháp nghiên cứu.", "Trình bày lần lượt các luận điểm, bằng chứng để làm sáng tỏ vấn đề nghiên cứu một cách chi tiết.", "Liệt kê danh sách toàn bộ các tài liệu tham khảo, sách, báo đã sử dụng trong quá trình viết bài.", "Khái quát lại ý nghĩa của vấn đề đã nghiên cứu và kết quả nghiên cứu mà bài viết đạt được." ], "correctIndex": 3, "timeLimit": 20, "explanation": "Theo cấu trúc bài báo cáo nghiên cứu, phần Kết luận có nhiệm vụ khái quát lại ý nghĩa của vấn đề và tổng kết kết quả nghiên cứu." } ]"`;

function smartParseJSON(rawText) {
  let text = rawText.trim().replace(/^\uFEFF/, '');

  if ((text.startsWith('"[')) || (text.startsWith('"{')) || (text.startsWith("'[")) || (text.startsWith("'{"))) {
    if (text.endsWith('"') || text.endsWith("'")) {
      text = text.slice(1, -1).trim();
    }
  }

  try {
    const data = JSON.parse(text);
    if (Array.isArray(data) || (data && data.questions)) return data;
  } catch (e1) {}

  try {
    const fn = new Function('return ' + text);
    const res = fn();
    if (res && (Array.isArray(res) || res.questions)) return res;
  } catch (e2) {}

  try {
    let repaired = text;
    repaired = repaired.replace(/("questionText"\s*:\s*")([\s\S]*?)("\s*,\s*"options")/g, (fullMatch, head, body, tail) => {
      return head + body.replace(/"/g, '’') + tail;
    });

    repaired = repaired.replace(/("explanation"\s*:\s*")([\s\S]*?)("\s*\}|\s*"\s*,\s*")/g, (fullMatch, head, body, tail) => {
      return head + body.replace(/"/g, '’') + tail;
    });

    repaired = repaired.replace(/("options"\s*:\s*\[)([\s\S]*?)(\]\s*,\s*"correctIndex")/g, (fullMatch, head, body, tail) => {
      let cleanBody = body.replace(/"([^"]*)"/g, (m, optText) => '"' + optText.replace(/"/g, '’') + '"');
      return head + cleanBody + tail;
    });

    const res = JSON.parse(repaired);
    if (Array.isArray(res) || (res && res.questions)) return res;
  } catch (e3) {}

  const questions = [];
  const chunks = text.split(/(?=\{\s*"questionText")/gi);

  chunks.forEach((chunk) => {
    if (!chunk.includes('"questionText"')) return;

    const qTextMatch = chunk.match(/"questionText"\s*:\s*"([\s\S]*?)"\s*,\s*"options"/i);
    const optionsMatch = chunk.match(/"options"\s*:\s*\[([\s\S]*?)\]\s*,\s*"correctIndex"/i);
    const correctMatch = chunk.match(/"correctIndex"\s*:\s*(\d+)/i);
    const timeMatch = chunk.match(/"timeLimit"\s*:\s*(\d+)/i);
    const expMatch = chunk.match(/"explanation"\s*:\s*"([\s\S]*?)"(?=\s*\}|\s*$)/i);

    if (qTextMatch && optionsMatch) {
      const qText = qTextMatch[1].replace(/\\"/g, '"');
      const rawOpts = optionsMatch[1];
      
      const optItems = [];
      const optRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let optM;
      while ((optM = optRegex.exec(rawOpts)) !== null) {
        optItems.push(optM[1].replace(/\\"/g, '"'));
      }

      if (optItems.length < 2) {
        const parts = rawOpts.split(/",\s*"/).map(s => s.replace(/^"|"$/g, '').trim());
        if (parts.length >= 2) {
          optItems.length = 0;
          optItems.push(...parts);
        }
      }

      while (optItems.length < 4) optItems.push('Không có');

      questions.push({
        questionText: qText,
        options: optItems.slice(0, 4),
        correctIndex: correctMatch ? parseInt(correctMatch[1], 10) : 0,
        timeLimit: timeMatch ? parseInt(timeMatch[1], 10) : 20,
        explanation: expMatch ? expMatch[1].replace(/\\"/g, '"') : ''
      });
    }
  });

  return questions;
}

const result = smartParseJSON(rawText);
console.log("PARSED QUESTIONS COUNT:", result.length);
console.log("FIRST QUESTION:", JSON.stringify(result[0], null, 2));
