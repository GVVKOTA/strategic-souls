import { database } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

const PUBLIC_HEADERS = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Read-only public directory of explicitly opt-in discoverable Research Rooms.
 * Never returns private rooms, member lists, private posts, emails, or internal subject IDs.
 */
export async function GET(request?: Request): Promise<Response> {
  try {
    const q = (
      request ? (new URL(request.url).searchParams.get("q") ?? "") : ""
    )
      .trim()
      .toLowerCase()
      .slice(0, 80);
    const db = database();
    const pattern = "%" + q.replace(/[!%_]/g, "!$&") + "%";

    const sql = q
      ? `SELECT g.id, g.name, g.description, d.handle, g.created_at AS createdAt,
           (SELECT count(*) FROM x1_memberships m WHERE m.group_id = g.id) AS memberCount,
           (SELECT count(*) FROM x1_group_souls s WHERE s.group_id = g.id) AS soulCount
         FROM x1_groups g
         JOIN x2_group_directory d ON d.group_id = g.id
         WHERE d.discoverable = 1
           AND (lower(g.name) LIKE ? ESCAPE '!' OR lower(g.description) LIKE ? ESCAPE '!' OR lower(d.handle) LIKE ? ESCAPE '!')
         ORDER BY memberCount DESC, g.created_at DESC
         LIMIT 24`
      : `SELECT g.id, g.name, g.description, d.handle, g.created_at AS createdAt,
           (SELECT count(*) FROM x1_memberships m WHERE m.group_id = g.id) AS memberCount,
           (SELECT count(*) FROM x1_group_souls s WHERE s.group_id = g.id) AS soulCount
         FROM x1_groups g
         JOIN x2_group_directory d ON d.group_id = g.id
         WHERE d.discoverable = 1
         ORDER BY memberCount DESC, g.created_at DESC
         LIMIT 24`;

    const stmt = q
      ? db.prepare(sql).bind(pattern, pattern, pattern)
      : db.prepare(sql);
    const res = await stmt.all<{
      id: string;
      name: string;
      description: string;
      handle: string;
      createdAt: string;
      memberCount: number;
      soulCount: number;
    }>();

    return Response.json(
      {
        rooms: res.results ?? [],
        directoryOnly: true,
        asOf: new Date().toISOString(),
      },
      { status: 200, headers: PUBLIC_HEADERS },
    );
  } catch {
    return Response.json(
      {
        rooms: [],
        directoryOnly: true,
        asOf: new Date().toISOString(),
        error: "Research room directory is temporarily unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
