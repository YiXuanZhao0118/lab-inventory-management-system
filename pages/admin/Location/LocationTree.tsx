//pages\admin\Location\LocationTree.tsx
"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { LocationNode } from "../locationService";
import {
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  PlusCircle,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// 產生唯一 id
function generateId(): string {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

// 清除空 children，並保留 id
function cleanTree(nodes: LocationNode[]): LocationNode[] {
  return nodes.map(({ id, label, children }) => ({
    id,
    label,
    ...(children && children.length > 0
      ? { children: cleanTree(children) }
      : {}),
  }));
}

// 收集所有 label 用於驗重
function collectLabels(nodes: LocationNode[], acc = new Set<string>()) {
  for (const node of nodes) {
    acc.add(node.label);
    if (node.children) collectLabels(node.children, acc);
  }
  return acc;
}

export default function LocationTreeEditor() {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de": deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.LocationTree;

  // Debug: 檢查 context 狀態與 re-render
  // console.log("Current language:", language, translations);

  const { data, error, mutate } = useSWR<LocationNode[]>(
    "/api/Related-to-data/location-tree",
    fetcher
  );
  const [localTree, setLocalTree] = useState<LocationNode[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  function showMessage(
    text: string,
    type: "success" | "error",
    duration = 1000
  ) {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), duration);
  }

  useEffect(() => {
    if (data) {
      // 確保所有節點有 id
      function ensureId(nodes: any[]): LocationNode[] {
        return nodes.map(n => ({
          id: n.id || generateId(),
          label: n.label,
          children: n.children ? ensureId(n.children) : undefined,
        }));
      }
      setLocalTree(ensureId(data));
    }
  }, [data]);

  function removeAtPath(
    arr: LocationNode[],
    path: number[]
  ): [LocationNode[], LocationNode] {
    const copy = clone(arr);
    let parent: any = copy;
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children!;
    const idx = path[path.length - 1];
    const [node] = parent.splice(idx, 1);
    return [copy, node];
  }

  function insertAtPath(
    arr: LocationNode[],
    path: number[],
    node: LocationNode
  ) {
    const copy = clone(arr);
    let parent: any = copy;
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children!;
    parent.splice(path[path.length - 1], 0, node);
    return copy;
  }

  const move = (path: number[], d: 1 | -1) =>
    setLocalTree(prev => {
      const [without, node] = removeAtPath(prev, path);
      const idx = Math.max(0, path[path.length - 1] + d);
      return insertAtPath(without, [...path.slice(0, -1), idx], node);
    });

  const indent = (path: number[]) => {
    const idx = path[path.length - 1];
    if (idx === 0) return;
    setLocalTree(prev => {
      const [without, node] = removeAtPath(prev, path);
      const parentPath = path.slice(0, -1);
      const prevIdx = idx - 1;
      const copy = clone(without);
      let arr: any = copy;
      for (let k of parentPath) arr = arr[k].children!;
      arr[prevIdx].children = arr[prevIdx].children || [];
      return insertAtPath(
        copy,
        [...parentPath, prevIdx, arr[prevIdx].children.length],
        node
      );
    });
  };

  const outdent = (path: number[]) => {
    if (path.length < 2) return;
    setLocalTree(prev => {
      const [without, node] = removeAtPath(prev, path);
      const parentIdx = path[path.length - 2];
      const grandPath = path.slice(0, -2);
      return insertAtPath(without, [...grandPath, parentIdx + 1], node);
    });
  };

  const rename = (path: number[], newLabel: string) => {
    const copy: any = clone(localTree);
    const allLabels = collectLabels(copy);
    let target: any = copy;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children!;
    const oldLabel = target[path[path.length - 1]].label;

    if (newLabel === oldLabel) return;
    if (allLabels.has(newLabel)) {
      showMessage(`${t.Alert1Part1} "${newLabel}" ${t.Alert1Part2}`, "error");
      return;
    }

    target[path[path.length - 1]].label = newLabel;
    fetch("/api/location-tree/update-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName: oldLabel, newName: newLabel }),
    }).catch(err => console.error(`${t.Alert1Part3}`, err));

    setLocalTree(copy);
  };

  const addSibling = (path: number[]) => {
    const lab = prompt("New label");
    if (!lab) return;

    setLocalTree(prev => {
      const copy: any = clone(prev);
      const allLabels = collectLabels(copy);
      if (allLabels.has(lab)) {
        showMessage(`${t.Alert1Part1} "${lab}" ${t.Alert1Part2}`, "error");
        return prev;
      }
      let parent: any = copy;
      const sibPath = path.slice(0, -1);
      for (let k of sibPath) parent = parent[k].children!;
      parent.splice(path[path.length - 1] + 1, 0, {
        id: generateId(),
        label: lab,
      });
      return copy;
    });
  };

  const deleteNode = (path: number[]) =>
    setLocalTree(prev => removeAtPath(prev, path)[0]);

  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const toggle = (path: number[]) => {
    const key = path.join("-");
    setOpenSet(s => {
      const ns = new Set(s);
      ns.has(key) ? ns.delete(key) : ns.add(key);
      return ns;
    });
  };

  const renderNodes = (nodes: LocationNode[], base: number[] = []): React.ReactNode =>
    nodes.map((n, i) => {
      const path = [...base, i];
      const key = path.join("-");
      const hasChild = !!n.children?.length;
      const isOpen = openSet.has(key);

      return (
        <div key={key} className="mb-2">
          <div className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-800 rounded shadow">
            {hasChild ? (
              <button onClick={() => toggle(path)} className="p-1">
                {isOpen
                  ? <ChevronDown size={16} className="text-gray-600 dark:text-gray-300"/>
                  : <ChevronRight size={16} className="text-gray-600 dark:text-gray-300"/>}
              </button>
            ) : (
              <div className="w-4"/>
            )}

            <span
              contentEditable
              suppressContentEditableWarning
              className="flex-1 px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-sky-400"
              onBlur={e => rename(path, e.currentTarget.textContent || "")}
            >
              {n.label}
            </span>

            <div className="flex space-x-1">
              {([
                [move, -1, <ArrowUp />],
                [move, 1, <ArrowDown />],
                [indent, null, <ArrowRight />],
                [outdent, null, <ArrowLeft />],
                [addSibling, null, <PlusCircle />],
                [deleteNode, null, <Trash2 />]
              ] as const).map(([fn, arg, Icon], idx) => {
                const isAdd = Icon.type === PlusCircle;
                const isDelete = Icon.type === Trash2;
                const colorCls = isAdd
                  ? "text-blue-500"
                  : isDelete
                  ? "text-red-500"
                  : "text-gray-600 dark:text-gray-300";

                return (
                  <button
                    key={idx}
                    onClick={() =>
                      typeof arg === "number"
                        ? (fn as any)(path, arg)
                        : (fn as any)(path)
                    }
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  >
                    {React.cloneElement(Icon, {
                      size: 16,
                      className: colorCls,
                    })}
                  </button>
                );
              })}
            </div>
          </div>

          {hasChild && isOpen && (
            <div className="ml-6 border-l border-gray-300 dark:border-gray-700 pl-4">
              {renderNodes(n.children!, path)}
            </div>
          )}
        </div>
      );
    });

  const handleSave = async () => {
    try {
      const payload = cleanTree(localTree);
      const res = await fetch("/api/Related-to-data/location-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      showMessage(`${t.Alert2Part1}🎉`, "success");
      mutate();
      window.dispatchEvent(new Event("locationTreeUpdated"));
    } catch (err: any) {
      showMessage(`${t.Alert2Part2}：${err.message}`, "error");
    }
  };

  if (error) return (
    <Container>
      <div className="text-red-600">
        {t.LoadingFailed}：{(error as Error).message}
      </div>
    </Container>
  );
  if (!data) return (
    <Container>
      <div>{t.Loading}…</div>
    </Container>
  );

  return (
    <Container>
      <h1 className="text-2xl font-bold mb-4">📋 {t.title}</h1>

      {message && (
        <div className={`mb-4 p-2 rounded ${
          message.type === "success"
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {renderNodes(localTree)}

      <button
        onClick={handleSave}
        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
      >
        💾 {t.Save}
      </button>
    </Container>
  );
}
