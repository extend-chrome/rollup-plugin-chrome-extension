import { serve } from 'tests/runners'
import { testOutput } from 'tests/testOutput'

let result: Awaited<ReturnType<typeof serve>> | undefined

afterAll(async () => {
  await result?.server.close()
})

// TODO: handle main world scripts through web_accessible_resources

test('serve fs output', async () => {
  result = await serve(__dirname)
  await testOutput(result)
})
