"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Brain,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Puzzle,
  Scale,
  Settings,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
];

const dataMasterItems = [
  { title: "Data Berita (Raw)", href: "/news_data", icon: FileText },
  { title: "Hasil Deduplikasi", href: "/deduplication", icon: Trash2 },
];

const pipelineItems = [
  { title: "Preprocessing", href: "/preprocess", icon: Settings },
  { title: "SentiStrength", href: "/sentistrength", icon: Scale },
  { title: "Inset Feature", href: "/inset_feature", icon: Puzzle },
  { title: "TF-IDF", href: "/tf-idf", icon: BarChart3 },
  { title: "CNB Modeling", href: "/modeling", icon: Brain },
  { title: "Evaluasi", href: "/evaluation", icon: TrendingUp },
];
const Sidebar = () => {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };
  return (
    <aside className="p-2 h-full shrink-0">
      <Card className="flex flex-col shadow-none px-6 py-4 border h-full overflow-hidden">
        {/* Header - padding lebih kecil */}
        <div className="pb-2 border-b">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary p-1.5 rounded-md">
              <Brain className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-3xl leading-tight tracking-tight">
                GOSENTI
              </h1>
              <p className="text-muted-foreground text-sm leading-tight">
                Sentiment Analysis
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 p-2 overflow-y-auto">
          {/* Main */}
          <div className="space-y-0.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium text-sm transition-all duration-200",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                  <span className="flex-1">{item.title}</span>
                  {active && <ChevronRight className="w-3.5 h-3.5" />}
                </Link>
              );
            })}
          </div>

          {/* Data Master */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 px-2.5">
              {/* <Database className="w-3 h-3 text-muted-foreground" /> */}
              <h2 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                Data Master
              </h2>
            </div>
            <div className="space-y-0.5">
              {dataMasterItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium text-sm transition-all duration-200",
                      active
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex-1">{item.title}</span>
                    {active && <ChevronRight className="w-3.5 h-3.5" />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 px-2.5">
              {/* <Workflow className="w-3 h-3 text-muted-foreground" /> */}
              <h2 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                Pipeline
              </h2>
            </div>
            <div className="space-y-0.5">
              {pipelineItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium text-sm transition-all duration-200",
                      active
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex-1">{item.title}</span>
                    {active && <ChevronRight className="w-3.5 h-3.5" />}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t">
          <div className="bg-secondary/50 p-2.5 rounded-md">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="bg-green-500 rounded-full w-1.5 h-1.5 animate-pulse"></div>
              <span className="font-medium text-[11px] text-foreground">
                System Ready
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Pipeline Active</p>
          </div>
        </div>
      </Card>
    </aside>
  );
};

export default Sidebar;
