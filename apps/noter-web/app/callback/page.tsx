async function CallBackPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filters = await searchParams

  // const { token_hash, type } = filters

  // fetch()

  return (
    <>
      <div className='flex h-30 max-w-3/4 items-center justify-center rounded-lg bg-pink-500 text-2xl'>
        CallbackPage
      </div>

      <div className='flex h-30 max-w-3/4 items-center justify-center rounded-lg bg-pink-500 text-2xl'>
        {JSON.stringify(filters)}
      </div>
    </>
  )
}

export default CallBackPage
