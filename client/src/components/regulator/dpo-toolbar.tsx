import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";

type Props = {
  onAppointClick?: () => void;
  onSearch?: (q: string, status?: string) => void;
};

export default function DpoToolbar({ onAppointClick, onSearch }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  function submitSearch() {
    if (onSearch) onSearch(query.trim(), status || undefined);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="flex items-center gap-2 w-full sm:max-w-lg">
        <div className="relative flex-1">
          <Input
            aria-label="Search DPO portal"
            placeholder="Search controllers, DPOs, records..."
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === "Enter") submitSearch(); }}
            className="pr-10"
          />
          <button aria-label="Search" onClick={submitSearch} className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground">
            <Search className="w-4 h-4" />
          </button>
        </div>
        <div className="hidden sm:block">
          <select value={status} onChange={(e: any) => setStatus(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="NOTIFIED">Notified</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => { submitSearch(); }} variant="ghost" size="sm">Refresh</Button>
        <Button onClick={() => onAppointClick && onAppointClick()} className="whitespace-nowrap" size="sm">
          <Plus className="w-4 h-4 mr-2" />Appoint DPO
        </Button>
      </div>
    </div>
  );
}
