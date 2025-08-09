const { Client } = require("@notionhq/client");

module.exports = async (req, res) => {
  try {
    const notion = new Client({ auth: process.env.NOTION_TOKEN });
    const q = req.query.q || ""; // optional name filter
    const search = await notion.search({
      query: q,
      filter: { value: "database", property: "object" },
      page_size: 25,
    });
    const rows = search.results.map(r => ({
      title: (r.title || []).map(t => t.plain_text).join(""),
      id: r.id,                       // dashed form
      id_plain: (r.id || "").replace(/-/g, ""), // hyphenless
      url: r.url
    }));
    res.status(200).json({ count: rows.length, databases: rows });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
};
