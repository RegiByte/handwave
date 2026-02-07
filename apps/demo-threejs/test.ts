import { z } from 'zod'

interface RegraA {
    tipo: 'A'
    valor: number
}

interface RegraB {
    tipo: 'B'
    valor: string
    minimo: number
    maximo: number
}


type Regra = RegraA | RegraB

const regra1 = {
    tipo: 'A',
    valor: 10
} as Regra

switch (regra1.tipo) {
    case 'A':
        regra1.
        console.log(regra1.valor)
        break
    case 'B':
        regra1.
        console.log(regra1.valor)
        break
    default:
        console.log('Regra não encontrada')
}


const regraASchema = z.object({
    tipo: z.literal('A'),
    valor: z.number()
})

const regraSchema = z.discriminatedUnion('tipo', [
    regraASchema,
    z.object({
        tipo: z.literal('B'),
        valor: z.string(),
        minimo: z.number(),
        maximo: z.number()
    })
])

type Regras = z.infer<typeof regraSchema>

const obj = {
    tipo: 'C',
    valores: 12
} as unknown

const validado = regraSchema.safeParse(obj)

if (!validado.success) {
    console.log(validado.error.message)
} else {
    console.log(validado.data)
}