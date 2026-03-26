const OpenAI = require('openai');

// 配置 Kimi AI (Moonshot AI)
// 兼容 OpenAI SDK，只需修改 baseURL 和 apiKey
const openai = process.env.MOONSHOT_API_KEY
  ? new OpenAI({
      apiKey: process.env.MOONSHOT_API_KEY,
      baseURL: 'https://api.moonshot.cn/v1', // Kimi AI 的 API 地址
    })
  : null;

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const db = new sqlite3.Database(path.join(__dirname, 'todo.db'));

function ensureSchema() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        priority TEXT NOT NULL DEFAULT '中',
        scheduled_time TEXT DEFAULT '',
        completed INTEGER DEFAULT 0,
        stage TEXT DEFAULT '待开始',
        attachments TEXT DEFAULT '[]',
        created_at TEXT NOT NULL
      )
    `);

    db.all(`PRAGMA table_info(tasks)`, [], (err, columns) => {
      if (err) {
        console.error('读取表结构失败：', err.message);
        return;
      }

      const columnNames = columns.map(col => col.name);
      if (!columnNames.includes('stage')) {
        db.run(`ALTER TABLE tasks ADD COLUMN stage TEXT DEFAULT '待开始'`, alterErr => {
          if (alterErr) {
            console.error('补充 stage 字段失败：', alterErr.message);
          } else {
            db.run(`
              UPDATE tasks
              SET stage = CASE
                WHEN completed = 1 THEN '已完成'
                ELSE '待开始'
              END
            `);
          }
        });
      }
    });
  });
}

ensureSchema();

function normalizeStage(stage, completed) {
  if (completed) return '已完成';
  if (stage === '进行中') return '进行中';
  return '待开始';
}

function parseTask(row) {
  const completed = !!row.completed;
  return {
    ...row,
    completed,
    stage: normalizeStage(row.stage, completed),
    attachments: row.attachments ? JSON.parse(row.attachments) : []
  };
}

function getTaskById(id, callback) {
  db.get(`SELECT * FROM tasks WHERE id = ?`, [id], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(null, null);
    callback(null, parseTask(row));
  });
}

app.get('/api/tasks', (req, res) => {
  const sql = `
    SELECT * FROM tasks
    ORDER BY
      CASE priority
        WHEN '高' THEN 3
        WHEN '中' THEN 2
        ELSE 1
      END DESC,
      datetime(created_at) DESC,
      id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取任务失败' });
    }
    res.json(rows.map(parseTask));
  });
});

app.get('/api/tasks/:id', (req, res) => {
  getTaskById(req.params.id, (err, task) => {
    if (err) {
      return res.status(500).json({ error: '获取任务详情失败' });
    }
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json(task);
  });
});

app.post('/api/tasks', (req, res) => {
  const {
    title,
    notes = '',
    priority = '中',
    scheduled_time = '',
    completed = false,
    stage = '待开始',
    attachments = []
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '任务标题不能为空' });
  }

  const normalizedCompleted = !!completed;
  const normalizedStage = normalizeStage(stage, normalizedCompleted);
  const createdAt = new Date().toISOString();

  const sql = `
    INSERT INTO tasks (title, notes, priority, scheduled_time, completed, stage, attachments, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      title.trim(),
      String(notes).trim(),
      priority,
      scheduled_time,
      normalizedCompleted ? 1 : 0,
      normalizedStage,
      JSON.stringify(Array.isArray(attachments) ? attachments : []),
      createdAt
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: '新增任务失败' });
      }

      getTaskById(this.lastID, (err2, task) => {
        if (err2) {
          return res.status(500).json({ error: '读取新增任务失败' });
        }
        res.status(201).json(task);
      });
    }
  );
});

app.put('/api/tasks/:id', (req, res) => {
  const {
    title,
    notes = '',
    priority = '中',
    scheduled_time = '',
    completed = false,
    stage = '待开始',
    attachments = []
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '任务标题不能为空' });
  }

  const normalizedCompleted = !!completed;
  const normalizedStage = normalizeStage(stage, normalizedCompleted);

  const sql = `
    UPDATE tasks
    SET title = ?, notes = ?, priority = ?, scheduled_time = ?, completed = ?, stage = ?, attachments = ?
    WHERE id = ?
  `;

  db.run(
    sql,
    [
      title.trim(),
      String(notes).trim(),
      priority,
      scheduled_time,
      normalizedCompleted ? 1 : 0,
      normalizedStage,
      JSON.stringify(Array.isArray(attachments) ? attachments : []),
      req.params.id
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: '更新任务失败' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '任务不存在' });
      }

      getTaskById(req.params.id, (err2, task) => {
        if (err2) {
          return res.status(500).json({ error: '读取更新后任务失败' });
        }
        res.json(task);
      });
    }
  );
});

app.patch('/api/tasks/:id/toggle', (req, res) => {
  db.get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: '切换状态失败' });
    }
    if (!row) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const newCompleted = row.completed ? 0 : 1;
    const newStage = newCompleted ? '已完成' : '待开始';

    db.run(
      `UPDATE tasks SET completed = ?, stage = ? WHERE id = ?`,
      [newCompleted, newStage, req.params.id],
      function (err2) {
        if (err2) {
          return res.status(500).json({ error: '更新状态失败' });
        }

        getTaskById(req.params.id, (err3, task) => {
          if (err3) {
            return res.status(500).json({ error: '读取任务失败' });
          }
          res.json(task);
        });
      }
    );
  });
});

app.patch('/api/tasks/:id/stage', (req, res) => {
  const { stage } = req.body;

  if (!['待开始', '进行中', '已完成'].includes(stage)) {
    return res.status(400).json({ error: '无效的任务状态' });
  }

  const completed = stage === '已完成' ? 1 : 0;

  db.run(
    `UPDATE tasks SET stage = ?, completed = ? WHERE id = ?`,
    [stage, completed, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: '更新任务状态失败' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '任务不存在' });
      }

      getTaskById(req.params.id, (err2, task) => {
        if (err2) {
          return res.status(500).json({ error: '读取任务失败' });
        }
        res.json(task);
      });
    }
  );
});

app.delete('/api/tasks/:id', (req, res) => {
  db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: '删除任务失败' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json({ message: '删除成功' });
  });
});

app.get('/api/ai/status', async (req, res) => {
  res.json({
    available: !!openai,
    message: openai ? 'AI 助理在线' : 'AI 助理未配置，当前使用手动模式'
  });
});

app.post('/api/ai/decompose', async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({
        error: 'AI 助理当前不可用，请先使用手动模式添加任务'
      });
    }

    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '请先输入任务内容' });
    }

    const prompt = String(text).trim();

    // 使用 Kimi AI 的 chat.completions API
    const response = await openai.chat.completions.create({
      model: 'moonshot-v1-8k', // Kimi 模型，可选：moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k
      messages: [
        {
          role: 'system',
          content: `
你是一个任务拆解助手。
把用户给出的中文任务拆解成 3 到 5 个可执行子任务。
同时给出每个子任务的优先级和分类。

输出必须是 JSON，格式如下：
{
  "category": "学习/写作/生活/工作/其他 之一",
  "subtasks": [
    {
      "title": "子任务标题",
      "priority": "高|中|低",
      "estimatedMinutes": 30
    }
  ]
}

要求：
1. title 要具体、短、可执行
2. 不要输出 markdown
3. 不要解释
4. 如果原任务已经很具体，也要尽量细分
          `
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: {
        type: 'json_object'
      }
    });

    const outputText = response.choices[0].message.content;
    const parsed = JSON.parse(outputText);

    res.json({
      ok: true,
      category: parsed.category,
      subtasks: parsed.subtasks
    });
  } catch (error) {
    console.error('AI 拆解失败：', error);
    res.status(503).json({
      error: 'AI 助理暂时不可用，已自动切换到手动模式'
    });
  }
});

app.post('/api/ai/classify', async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ error: 'AI 助理当前不可用' });
    }

    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '请先输入任务内容' });
    }

    // 使用 Kimi AI 的 chat.completions API
    const response = await openai.chat.completions.create({
      model: 'moonshot-v1-8k', // Kimi 模型
      messages: [
        {
          role: 'system',
          content: `
你是任务分类助手。
根据用户输入内容，返回一个 JSON：
{
  "category": "学习/写作/生活/工作/其他",
  "priority": "高/中/低"
}
不要输出解释，不要输出 markdown。
          `
        },
        {
          role: 'user',
          content: String(text).trim()
        }
      ],
      response_format: {
        type: 'json_object'
      }
    });

    res.json(JSON.parse(response.choices[0].message.content));
  } catch (error) {
    console.error('AI 分类失败：', error);
    res.status(503).json({
      error: 'AI 分类暂时不可用'
    });
  }
});

app.listen(PORT, () => {
  console.log(`服务器已启动：http://localhost:${PORT}`);
});