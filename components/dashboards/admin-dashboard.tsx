"use client";

import Link from "next/link";
import { CLASSES, USERS } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Users,
  GraduationCap,
  Building2,
  TrendingUp,
  ArrowRight,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CLASS_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
};
const ROLE_BADGE: Record<string, string> = {
  student: "bg-brand-subtle text-brand",
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export function AdminDashboard() {
  const students = USERS.filter((u) => u.role === "student");
  const teachers = USERS.filter((u) => u.role === "teacher");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Horizon Institute &middot; Spring 2026
          </p>
        </div>
        <Link href="/admin">
          <Button size="sm" className="gap-2 shrink-0">
            <Shield className="w-4 h-4" />
            Admin Panel
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Classes",
            value: String(CLASSES.length),
            icon: BookOpen,
            color: "indigo",
          },
          {
            label: "Students",
            value: String(students.length),
            icon: GraduationCap,
            color: "emerald",
          },
          {
            label: "Instructors",
            value: String(teachers.length),
            icon: Users,
            color: "violet",
          },
          { label: "Institution", value: "1", icon: Building2, color: "amber" },
        ].map((s) => {
          const colorMap: Record<string, string> = {
            indigo:
              "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
            amber:
              "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
            emerald:
              "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
            violet:
              "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
          };
          return (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    colorMap[s.color],
                  )}
                >
                  <s.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-none">
                    {s.label}
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {s.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* All Classes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                All Classes
              </CardTitle>
              <Link href="/classes">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Manage <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {CLASSES.map((cls) => (
              <div key={cls.id} className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0",
                    CLASS_BG[cls.color] ?? "bg-primary",
                  )}
                >
                  {cls.code.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {cls.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cls.studentIds.length} students
                  </p>
                </div>
                <Link href={`/classes/${cls.id}/home`}>
                  <Button variant="ghost" size="sm" className="text-xs">
                    View
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* All Users */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">All Users</CardTitle>
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  Manage <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {USERS.slice(0, 6).map((user) => (
              <div key={user.id} className="flex items-center gap-3">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                    {user.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none capitalize",
                    ROLE_BADGE[user.role],
                  )}
                >
                  {user.role}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
