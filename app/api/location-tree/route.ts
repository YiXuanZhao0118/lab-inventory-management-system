// app/api/location-tree/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  getLocationTree,
  saveLocationTree,
  getStock,
  type LocationNode,
} from "@/lib/db";

function flattenIds(nodes: LocationNode[]): string[] {
  const ids: string[] = [];
  const dfs = (arr: LocationNode[]) => {
    for (const n of arr) {
      ids.push(n.id);
      if (n.children?.length) dfs(n.children);
    }
  };
  dfs(nodes);
  return ids;
}

function buildChildMap(nodes: LocationNode[]): Map<string, number> {
  const m = new Map<string, number>();
  const dfs = (arr: LocationNode[]) => {
    for (const n of arr) {
      const cnt = n.children?.length ?? 0;
      m.set(n.id, cnt);
      if (cnt) dfs(n.children!);
    }
  };
  dfs(nodes);
  return m;
}

function collectSubtreeIds(root: LocationNode): string[] {
  const acc: string[] = [];
  const dfs = (n: LocationNode) => {
    acc.push(n.id);
    n.children?.forEach(dfs);
  };
  dfs(root);
  return acc;
}

export async function GET() {
  try {
    const tree = getLocationTree();
    return NextResponse.json(tree);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "GET failed" }, { status: 500 });
  }
}

// 你也可以把 rename 拆開一條 route，但建議用一次性 POST 儲存整棵樹，集中驗證。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nextTree = (body?.tree ?? []) as LocationNode[];

    // 後端強制驗證
    const prevTree = getLocationTree();
    const prevIds = new Set(flattenIds(prevTree));
    const nextIds = new Set(flattenIds(nextTree));
    const childMap = buildChildMap(nextTree);

    // 1) 刪除驗證：被刪掉的節點若尚有庫存，禁止
    const removedIds = [...prevIds].filter((id) => !nextIds.has(id));
    const stock = getStock();
    const removedInUse = new Set(
      stock.filter(s => removedIds.includes(s.locationId)).map(s => s.locationId)
    );
    if (removedInUse.size > 0) {
      return NextResponse.json(
        {
          error: "Some locations still have stock and cannot be removed.",
          blockedLocationIds: [...removedInUse],
          code: "DELETE_BLOCKED_STOCK",
        },
        { status: 400 }
      );
    }

    // 2) 葉節點驗證：所有持有庫存的 locationId，必須在新樹中為「葉節點」
    const badLeaf = new Set<string>();
    for (const s of stock) {
      if (!nextIds.has(s.locationId)) {
        // 位置被移除的情況已在上方處理；這裡直接當錯誤
        badLeaf.add(s.locationId);
      } else {
        const childCount = childMap.get(s.locationId) ?? 0;
        if (childCount > 0) badLeaf.add(s.locationId);
      }
    }
    if (badLeaf.size > 0) {
      return NextResponse.json(
        {
          error:
            "Locations that hold stock must be leaf nodes (no children). Please adjust the hierarchy.",
          nonLeafWithStock: [...badLeaf],
          code: "LEAF_RULE_VIOLATION",
        },
        { status: 400 }
      );
    }

    // 都 OK 才儲存
    saveLocationTree(nextTree);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "POST failed" }, { status: 400 });
  }
}
