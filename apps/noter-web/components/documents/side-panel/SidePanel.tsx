'use client'

import { Card, CardContent } from '@noter/ui/components/card'
import { Separator } from '@noter/ui/components/separator'
import { TagManager } from './TagManager'
import { TagFilterList } from './TagFilterList'
import { UserPanel } from './UserPanel'

export function SidePanel() {
  return (
    <Card className='sticky top-4 h-fit w-64 shrink-0'>
      <CardContent className='space-y-4 p-4'>
        <TagManager />
        <TagFilterList />
        <Separator />
        <UserPanel />
      </CardContent>
    </Card>
  )
}
