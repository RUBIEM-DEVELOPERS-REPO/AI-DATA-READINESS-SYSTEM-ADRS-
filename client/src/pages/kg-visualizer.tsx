import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import ForceGraph2D from "react-force-graph-2d";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut, ArrowLeft } from "lucide-react";
import type { PublishedDataset } from "@shared/schema";

interface GraphData {
  nodes: any[];
  links: any[];
}

export default function KgVisualizer({ datasetId: propDatasetId }: { datasetId?: string }) {
  const params = useParams();
  const [, setLocation] = useLocation();
  const datasetId = propDatasetId || params.datasetId;

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  // Fetch available datasets
  const { data: datasets, isLoading: loadingDatasets } = useQuery<PublishedDataset[]>({
    queryKey: ["/api/datasets"],
  });

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fetch and parse JSONL
  useEffect(() => {
    if (!datasetId) {
      setGraphData(null);
      return;
    }
    const loadGraph = async () => {
      setLoadingGraph(true);
      try {
        const res = await fetch(`/api/datasets/${datasetId}/artifact?type=kg_graph`);
        if (!res.ok) throw new Error("Failed to fetch graph data");
        const text = await res.text();
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        
        const nodes: any[] = [];
        const links: any[] = [];
        
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            if (record.record_type === "NODE") {
              nodes.push({
                id: record.id,
                name: record.properties?.display_name || record.label,
                val: record.properties?.confidence_score ? record.properties.confidence_score * 10 : 5,
                group: record.label,
                ...record
              });
            } else if (record.record_type === "EDGE") {
              links.push({
                source: record.from,
                target: record.to,
                name: record.type_label,
                ...record
              });
            }
          } catch (e) {
            // ignore parse errors for individual lines
          }
        }
        setGraphData({ nodes, links });
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingGraph(false);
      }
    };
    loadGraph();
  }, [datasetId]);

  // Color palette for node groups
  const getColor = useCallback((group: string) => {
    const colors: Record<string, string> = {
      PARTY: "#3b82f6", // blue
      DOCUMENT: "#10b981", // green
      ORGANIZATION: "#8b5cf6", // purple
      PERSON: "#f59e0b", // orange
      TRANSACTION: "#ef4444", // red
      OBJECT: "#6b7280", // gray
    };
    return colors[group] || "#9ca3af";
  }, []);

  const handleZoomIn = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom * 1.5, 400);
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(currentZoom / 1.5, 400);
    }
  };

  const handleFit = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Graph Visualizer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Explore entities and their relationships.
          </p>
        </div>
        
        <div className="flex items-center gap-3 z-50">
          <Button variant="outline" onClick={() => setLocation("/publishing")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Datasets
          </Button>

          <Select 
            value={datasetId || ""} 
            onValueChange={(val) => setLocation(`/graph/${val}`)}
            disabled={loadingDatasets}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a dataset..." />
            </SelectTrigger>
            <SelectContent>
              {datasets?.map(ds => (
                <SelectItem key={ds.id} value={ds.datasetCode}>
                  {ds.name} (v{ds.version})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col border-border/50 shadow-sm relative">
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-background/80 backdrop-blur-sm p-1.5 rounded-lg border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleFit} title="Fit to Screen">
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>

        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 bg-background/80 backdrop-blur-sm p-3 rounded-lg border shadow-sm text-xs text-muted-foreground pointer-events-none">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div> Party</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#10b981]"></div> Document</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#8b5cf6]"></div> Organization</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div> Person</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#ef4444]"></div> Transaction</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#6b7280]"></div> Object</div>
        </div>

        <CardContent className="p-0 flex-1 relative bg-muted/5" ref={containerRef}>
          {loadingGraph ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                <p className="text-sm text-muted-foreground">Loading graph data...</p>
              </div>
            </div>
          ) : !datasetId ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a dataset to visualize its Knowledge Graph.</p>
            </div>
          ) : graphData?.nodes?.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No graph data found for this dataset.</p>
            </div>
          ) : graphData ? (
            <ForceGraph2D
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              nodeLabel="name"
              nodeColor={(node: any) => getColor(node.group)}
              nodeRelSize={6}
              linkColor={() => "rgba(156, 163, 175, 0.4)"}
              linkWidth={1.5}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              onNodeDragEnd={(node: any) => {
                node.fx = node.x;
                node.fy = node.y;
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
