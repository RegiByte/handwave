import { createSubscription } from './state'

/**
 * Simple stateless dual communication channel supporting multiple workers and watchers.
 */

export function createChannel<TInput, TOutput, TWorkOutput = void>() {
  const inputChannel = createSubscription<TInput>()
  const outputChannel = createSubscription<TOutput>()

  return {
    in: inputChannel,
    out: outputChannel,
    work: (
      workerFn: (
        input: TInput,
        resolve: (output: TOutput | TWorkOutput) => void // mark as complete asyncrinously if needed
      ) => TOutput | TWorkOutput
    ) => {
      const cleanup = inputChannel.subscribe((input) => {
        const output = workerFn(input, (outAsync) => {
          if (outAsync) {
            outputChannel.notify(outAsync as TOutput)
          }
        })

        if (output) {
          outputChannel.notify(output as TOutput)
        }
      })
      return () => {
        cleanup()
      }
    },
    watch: (watcherFn: (output: TOutput) => void) => {
      const cleanup = outputChannel.subscribe(watcherFn)
      return () => {
        cleanup()
      }
    },
    put: (input: TInput) => {
      inputChannel.notify(input)
    },
    clear: () => {
      inputChannel.clear()
      outputChannel.clear()
    },
  }
}

export type Channel<TInput, TOutput, TWorkOutput = void> = ReturnType<
  typeof createChannel<TInput, TOutput, TWorkOutput>
>

export type ChannelWorkerFn<TInput, TOutput, TWorkOutput = void> = (
  input: TInput,
  resolve: (output: TOutput | TWorkOutput) => void
) => TOutput | TWorkOutput
