import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TestPage() {
  return (
    <main className="max-w-md mx-auto mt-10 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Teste Shadcn/UI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tudo certo com o tema 🎨
          </p>
          <Button>Botão padrão</Button>
          <Button variant="secondary">Botão secundário</Button>
          <Button variant="destructive">Excluir</Button>
        </CardContent>
      </Card>
    </main>
  );
}
