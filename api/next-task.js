// api/next-task.js
const { Client } = require("@notionhq/client");

const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  NEXT_TASK_SECRET,
} = process.env;

// ---- EDIT THESE if your property names differ ----
const PROP = {
  done: "Done",        // checkbox
  scheduled: "Date",   // <-- your date column is named "Date"
  status: "Status",    // select (optional)
  priority: "Priority" // select (optional; safe if missing)
};
const STATUS_ORDER = ["Now", "Active"];
const PRIORITY_ORDER = ["High", "Medium", "Low"];
// --------------------------------------------------

const notion = new Client({ auth: NOTION_TOKEN });

// Helper: get the title text regardless of the title property name
function getTitleFromProps(props) {
  for (const [key, val] of Object.entries(props)) {
    if (val?.type === "title") {
      const arr = val.title || [];
      return arr.map(t => t.plain_text).join("") || "Untitled";
    }
  }
  return "Untitled";
}

module.exports = async (req, res) => {
  try {
    if (!NEXT_TASK_SECRET || req.query.key !== NEXT_TASK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Pull open tasks
    const query = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: { property: PROP.done, checkbox: { equals: false } },
      sorts: [{ property: PROP.scheduled, direction: "ascending" }],
      page_size: 50,
    });

    const now = new Date();

    const tasks = query.results.map((p) => {
      const props = p.properties || {};
      const title = getTitleFromProps(props);

      const status = props[PROP.status]?.select?.name || null;
      const priority = props[PROP.priority]?.select?.name || null;

      const dateProp = props[PROP.scheduled]?.date || null;
      const start = dateProp?.start ? new Date(dateProp.start) : null;

      return {
        id: p.id,
        title,
        url: p.url,
        status,
        priority,
        scheduled: start ? start.toISOString() : null,
        isOverdue: start ? start < now : false,
      };
    });

    // Rank: Now/Active → overdue (earliest first) → upcoming (soonest) → no date
    const rank = (t) => {
      const hot = t.status && STATUS_ORDER.includes(t.status);
      const bucket = hot ? 0 : (t.scheduled ? (t.isOverdue ? 1 : 2) : 3);
      const statusRank = hot ? STATUS_ORDER.indexOf(t.status) : 99;
      const whenRank = t.scheduled ? new Date(t.scheduled).getTime() : Number.MAX_SAFE_INTEGER;
      const priorityRank = t.priority ? PRIORITY_ORDER.indexOf(t.priority) : PRIORITY_ORDER.length;
      return [bucket, statusRank, whenRank, priorityRank];
    };

    tasks.sort((a, b) => {
      const A = rank(a), B = rank(b);
      for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i];
      return 0;
    });

    const next = tasks[0] || null;

    return res.status(200).json({
      nextTask: next
        ? {
            id: next.id,
            title: next.title,
            url: next.url,
            status: next.status,
            priority: next.priority,
            scheduled: next.scheduled,
            overdue: next.isOverdue,
          }
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
};
