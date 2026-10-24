"use client";

import { Button, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { motion } from "motion/react";
import { folderPathLabel } from "@/lib/folder-tree";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  formatStatusLabel,
  parseTagInput,
  type BulkPatch,
  type FlatFolder,
  type Folder,
} from "./cases-model";

export function CasesBulkBar({
  selectedCount,
  bulkPending,
  bulkTags,
  folders,
  flatFolders,
  onBulkTags,
  onBulkUpdate,
  onClear,
}: {
  selectedCount: number;
  bulkPending: boolean;
  bulkTags: string;
  folders: Folder[];
  flatFolders: FlatFolder[];
  onBulkTags: (value: string) => void;
  onBulkUpdate: (patch: BulkPatch) => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-accent-soft)] px-3 py-2"
    >
      <span className="text-xs font-medium text-[color:var(--topo-ink)]">
        {selectedCount} selected
      </span>
      <Select
        className="w-[8.5rem]"
        variant="secondary"
        placeholder="Status"
        onChange={(value) => {
          if (value == null) return;
          onBulkUpdate({ status: String(value) });
        }}
      >
        <Label className="sr-only">Bulk status</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {CASE_STATUSES.map((status) => (
              <ListBox.Item
                key={status}
                id={status}
                textValue={formatStatusLabel(status)}
              >
                {formatStatusLabel(status)}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Select
        className="w-[12rem]"
        variant="secondary"
        placeholder="Move folder"
        onChange={(value) => {
          if (value == null) return;
          const next = String(value);
          onBulkUpdate({ folderId: next === "none" ? null : next });
        }}
      >
        <Label className="sr-only">Bulk folder</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="none" textValue="Unfiled">
              Unfiled
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {flatFolders.map((folder) => {
              const label = folderPathLabel(folders, folder.id);
              return (
                <ListBox.Item key={folder.id} id={folder.id} textValue={label}>
                  <span style={{ paddingLeft: folder.depth * 10 }}>{label}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Select.Popover>
      </Select>
      <TextField name="bulk-tags" className="w-40">
        <Label className="sr-only">Add tags</Label>
        <Input
          placeholder="Add tags…"
          value={bulkTags}
          onChange={(e) => onBulkTags(e.target.value)}
        />
      </TextField>
      <Button
        size="sm"
        variant="secondary"
        isDisabled={bulkPending || !bulkTags.trim()}
        onPress={() =>
          onBulkUpdate({
            tags: parseTagInput(bulkTags),
            tagMode: "add",
          })
        }
      >
        Add tags
      </Button>
      <Button
        size="sm"
        variant="tertiary"
        isDisabled={bulkPending}
        onPress={onClear}
      >
        Clear
      </Button>
    </motion.div>
  );
}
