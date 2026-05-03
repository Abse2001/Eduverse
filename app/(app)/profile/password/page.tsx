import Link from "next/link"
import { ArrowLeft, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function PasswordChangePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Button asChild variant="ghost" className="px-0">
        <Link href="/profile">
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
      </Button>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">
              Change password
            </h1>
            <p className="text-sm text-muted-foreground">
              Password change settings will be available here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
