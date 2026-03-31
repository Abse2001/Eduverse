"use client";

import Link from "next/link";
import { useApp } from "@/lib/store";
import {
  getClassesByTeacher,
  getStudentsInClass,
  getAssignmentsByClass,
  USERS,
  Class,
} from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BookOpen,
  Users,
  FileText,
  TrendingUp,
  ArrowRight,
  Video,
  PlusCircle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CLASS_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
};

export function TeacherDashboard() {
  const { currentUser } = useApp();
  const myClasses = getClassesByTeacher(currentUser.id);

  const totalStudents = new Set(myClasses.flatMap((c) => c.studentIds)).size;

  const totalAssignments = myClasses.reduce(
    (sum, c) => sum + getAssignmentsByClass(c.id).length,
    0,
  );

  const pendingGrades = myClasses
    .flatMap((c) => getAssignmentsByClass(c.id))
    .filter((a) => a.status === "submitted").length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            Welcome back, {currentUser.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {currentUser.institution} &middot; Spring 2026
          </p>
        </div>
        <Button size="sm" className="gap-2 shrink-0">
          <PlusCircle className="w-4 h-4" />
          New Assignment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Classes"
          value={String(myClasses.length)}
          icon={BookOpen}
          color="indigo"
        />
        <StatCard
          label="Total Students"
          value={String(totalStudents)}
          icon={Users}
          color="emerald"
        />
        <StatCard
          label="Assignments"
          value={String(totalAssignments)}
          icon={FileText}
          color="violet"
        />
        <StatCard
          label="Pending Grades"
          value={String(pendingGrades)}
          icon={TrendingUp}
          color="amber"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Classes */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Your Classes</h2>
            <Link href="/classes">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                Manage <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          {myClasses.map((cls) => {
            const students = getStudentsInClass(cls.id);
            const assignments = getAssignmentsByClass(cls.id);
            const submitted = assignments.filter(
              (a) => a.status === "submitted",
            ).length;
            return (
              <Card key={cls.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0",
                        CLASS_BG[cls.color] ?? "bg-primary",
                      )}
                    >
                      {cls.code.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground">
                          {cls.name}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {cls.schedule}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cls.code} &middot; {cls.room}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex -space-x-1.5">
                          {students.slice(0, 4).map((s) => (
                            <Avatar
                              key={s.id}
                              className="w-6 h-6 ring-2 ring-card"
                            >
                              <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                {s.avatar}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {students.length > 4 && (
                            <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-card flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                              +{students.length - 4}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {students.length} students
                        </span>
                        {submitted > 0 && (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            {submitted} to grade
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Link href={`/classes/${cls.id}/home`} className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                      >
                        <BookOpen className="w-3 h-3" /> Class Home
                      </Button>
                    </Link>
                    <Link
                      href={`/classes/${cls.id}/session`}
                      className="flex-1"
                    >
                      <Button size="sm" className="w-full text-xs gap-1.5">
                        <Video className="w-3 h-3" /> Start Session
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions & Schedule */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-semibold text-foreground">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "Start Session",
                  icon: Video,
                  href: `/classes/${myClasses[0]?.id}/session`,
                },
                {
                  label: "New Material",
                  icon: FileText,
                  href: `/classes/${myClasses[0]?.id}/materials`,
                },
                {
                  label: "Schedule Exam",
                  icon: Calendar,
                  href: `/classes/${myClasses[0]?.id}/assignments`,
                },
                {
                  label: "View Chat",
                  icon: Users,
                  href: `/classes/${myClasses[0]?.id}/chat`,
                },
              ].map((action) => (
                <Link key={action.label} href={action.href ?? "#"}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
                      <action.icon className="w-5 h-5 text-primary" />
                      <span className="text-xs font-medium text-foreground">
                        {action.label}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Today's schedule */}
          <div className="space-y-2">
            <h2 className="font-semibold text-foreground">
              Today&apos;s Schedule
            </h2>
            {myClasses.slice(0, 3).map((cls) => (
              <Card key={cls.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-10 rounded-full shrink-0",
                      CLASS_BG[cls.color] ?? "bg-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {cls.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cls.schedule}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
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
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            colorMap[color],
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-none">{label}</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
