import { createFileRoute } from '@tanstack/react-router'
import { MainView } from '@/components/MainView'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return <MainView />
}
