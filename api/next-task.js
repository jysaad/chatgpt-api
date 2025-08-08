import { Client } from "@notionhq/client";

const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  NEXT_TASK_SECRET,
} = process.env;

const PROP = {
  done: "Done",
  scheduled: "Scheduled",
  status: "Status",
  priority: "Priority",
};

const STATUS_ORDER = ["Now", "Active"];
const PRIORITY_ORDER = ["High", "Medium", "Low"];

const notion = new Client({ auth: NOTION_TOKEN });

export default async function handler(req, res) {
  try {
    if (!NEXT_TASK_SECRET || req.query.key !== NEXT_TASK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const query = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        property: PROP.done,
        checkbox: { equals: false },
      },
      sorts: [
        { property: PROP.scheduled, direction: "ascending" },
      ],
      page_size: 50,
    });

    const now = new Date();

    const tasks = query.results.map((p) => {
      const props = p.properties || {};
      const title =
        (props.Name?.title?.map(t => t.plain_text).join("") ?? "") ||
        (p.url ?? "Untitled");

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

    const rank = (t) => {
      const hasHotStatus = t.status && STATUS_ORDER.includes(t.status);
      const bucket = hasHotStatus ? 0 : (t.scheduled ? (t.isOverdue ? 1 : 2) : 3);
      const statusRank = hasHotStatus ? STATUS_ORDER.indexOf(t.status) : 99;
      const whenRank = t.scheduled ? new Date(t.scheduled).getTime() : Number.MAX_SAFE_INTEGER;
      const priorityRank = t.priority
        ? PRIORITY_ORDER.indexOf(t.priority)
        : PRIORITY_ORDER.length;
      return [bucket, statusRank, whenRank, priorityRank];
    };

    tasks.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
      }
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
    return res.status(500).json({ error: String(err) });
  }
}
