async function CallBackPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <>
      <div className='flex h-30 max-w-3/4 items-center justify-center rounded-lg bg-pink-500 text-2xl'>
        CallbackPage
      </div>

      <div className='flex h-30 max-w-3/4 items-center justify-center rounded-lg bg-pink-500 text-2xl'>
        {JSON.stringify(params)}
      </div>
    </>
  )
}

export default CallBackPage
