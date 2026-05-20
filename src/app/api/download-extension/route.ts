import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'backlog-maldito-v1.2.0.zip')
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'ZIP not found' }, { status: 404 })
  }
  const fileBuffer = fs.readFileSync(filePath)
  const stats = fs.statSync(filePath)
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="backlog-maldito-v1.2.0.zip"',
      'Content-Length': String(stats.size),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
