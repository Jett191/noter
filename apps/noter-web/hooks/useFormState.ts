import { useState } from 'react'

// Note: function useFormState<T extends Record<string, unknown>>(initialState: T) {}

export function useFormState<T>(initialState: T) {
  const [form, setForm] = useState<T>(initialState)

  const handleChange = <K extends keyof T>(key: K, value: T[K]) => {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  const resetForm = () => {
    setForm(initialState)
  }

  return {
    form,
    setForm,
    handleChange,
    resetForm
  }
}
