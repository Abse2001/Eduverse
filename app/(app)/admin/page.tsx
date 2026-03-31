"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import {
  USERS,
  CLASSES,
  ASSIGNMENTS,
  getStudentsInClass,
  getUserById,
} from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  BookOpen,
  GraduationCap,
  BarChart3,
  Search,
  PlusCircle,
  MoreHorizontal,
  ShieldCheck,
  School,
  TrendingUp,
  Activity,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<string, string> = {
  student: "bg-brand-subtle text-brand",
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const CLASS_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
};

export default function AdminPage() {
  const { currentUser } = useApp();

  if (currentUser.role !== "admin") {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center pt-24">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">
          Access Restricted
        </h1>
        <p className="text-sm text-muted-foreground">
          Only administrators can access this panel.
        </p>
      </div>
    );
  }

  const students = USERS.filter((u) => u.role === "student");
  const teachers = USERS.filter((u) => u.role === "teacher");
  const totalAssignments = ASSIGNMENTS.length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            {currentUser.institution} &middot; Spring 2026
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <ShieldCheck className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Administrator
          </span>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Students",
            value: students.length,
            icon: GraduationCap,
            color: "indigo",
            sub: "Active",
          },
          {
            label: "Teachers",
            value: teachers.length,
            icon: School,
            color: "emerald",
            sub: "Faculty",
          },
          {
            label: "Classes",
            value: CLASSES.length,
            icon: BookOpen,
            color: "violet",
            sub: "This semester",
          },
          {
            label: "Assignments",
            value: totalAssignments,
            icon: BarChart3,
            color: "amber",
            sub: "Total",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  s.color === "indigo" &&
                    "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
                  s.color === "emerald" &&
                    "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                  s.color === "violet" &&
                    "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
                  s.color === "amber" &&
                    "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                )}
              >
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList className="h-9">
          <TabsTrigger value="users" className="text-xs gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="classes" className="text-xs gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Classes
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        {/* Classes tab */}
        <TabsContent value="classes" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">All Classes</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-7"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add Class
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {CLASSES.map((cls) => {
                  const teacher = getUserById(cls.teacherId);
                  return (
                    <div
                      key={cls.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0",
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
                          {cls.code} &middot; {teacher?.name}
                        </p>
                      </div>
                      <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {cls.studentIds.length} students
                        </span>
                        <span>{cls.room}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] ml-2">
                        {cls.semester}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity tab */}
        <TabsContent value="activity" className="mt-4">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "student" | "teacher" | "admin">(
    "all",
  );

  const filtered = USERS.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || u.role === filter;
    return matchSearch && matchFilter;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "student", "teacher", "admin"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setFilter(r)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                  filter === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs h-7 ml-2"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add User
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {filtered.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
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
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] border-0 capitalize shrink-0",
                  ROLE_BADGE[user.role],
                )}
              >
                {user.role}
              </Badge>
              <div className="hidden md:block text-xs text-muted-foreground shrink-0">
                {user.institution}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No users match your search.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const ACTIVITY_FEED = [
  {
    id: 1,
    actor: "Jordan Kim",
    action: "submitted",
    target: "Assignment 1 — Linked Lists",
    cls: "CS301",
    time: "2 min ago",
    color: "emerald",
  },
  {
    id: 2,
    actor: "Dr. Priya Nair",
    action: "started a session in",
    target: "Data Structures & Algorithms",
    cls: "CS301",
    time: "15 min ago",
    color: "indigo",
  },
  {
    id: 3,
    actor: "Alex Rivera",
    action: "joined exam",
    target: "Midterm — Data Structures",
    cls: "CS301",
    time: "30 min ago",
    color: "amber",
  },
  {
    id: 4,
    actor: "Prof. Carlos Mendes",
    action: "uploaded material in",
    target: "Web Development Bootcamp",
    cls: "WD101",
    time: "1 hr ago",
    color: "emerald",
  },
  {
    id: 5,
    actor: "Sam Chen",
    action: "scored 95 on",
    target: "Lab 1 — Linear Regression",
    cls: "ML201",
    time: "2 hr ago",
    color: "violet",
  },
  {
    id: 6,
    actor: "Morgan Walsh",
    action: "submitted",
    target: "Project 1 — Portfolio Page",
    cls: "WD101",
    time: "3 hr ago",
    color: "emerald",
  },
  {
    id: 7,
    actor: "Taylor Brooks",
    action: "joined class",
    target: "Machine Learning Fundamentals",
    cls: "ML201",
    time: "5 hr ago",
    color: "violet",
  },
];

function ActivityTab() {
  const dotColor: Record<string, string> = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
    amber: "bg-amber-500",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Recent Platform Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {ACTIVITY_FEED.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-col items-center gap-1 pt-1.5 shrink-0">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    dotColor[item.color] ?? "bg-muted-foreground",
                  )}
                />
                <div className="w-px flex-1 bg-border min-h-[12px]" />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{item.actor}</span>{" "}
                  {item.action}{" "}
                  <span className="font-medium">{item.target}</span>
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] border-0">
                    {item.cls}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
