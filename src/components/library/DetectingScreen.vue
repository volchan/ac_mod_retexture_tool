<script setup lang="ts">
import { CheckIcon, LoaderIcon, XIcon } from 'lucide-vue-next'
import type { AcProbeResult } from '@/types/index'

defineProps<{ probes: AcProbeResult[] }>()
defineEmits<{ 'pick-manually': [] }>()

defineExpose({ CheckIcon, LoaderIcon, XIcon })
</script>

<template>
  <div class="flex-1 h-full bg-background flex items-center justify-center p-10">
    <div class="max-w-[540px] w-full">
      <div class="text-center mb-6">
        <div
          class="inline-flex w-[52px] h-[52px] rounded-[14px] bg-[var(--accent-muted)] text-primary items-center justify-center mb-3.5 animate-spin"
          style="animation-duration:1.5s"
        >
          <LoaderIcon :size="24" />
        </div>
        <h1 class="text-[22px] font-bold tracking-tight text-foreground mb-1.5">
          Looking for Assetto Corsa…
        </h1>
        <p class="text-[13px] text-muted-foreground">Checking common install locations</p>
      </div>

      <div class="bg-card border border-border rounded-[10px] overflow-hidden">
        <div
          v-for="(probe, i) in probes"
          :key="probe.path"
          class="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px]"
          :class="i < probes.length - 1 ? 'border-b border-border' : ''"
        >
          <XIcon
            v-if="probe.status === 'miss'"
            :size="13"
            class="text-muted-foreground opacity-60"
            :stroke-width="2"
          />
          <CheckIcon
            v-else-if="probe.status === 'hit'"
            :size="13"
            class="text-green-500"
            :stroke-width="2.5"
          />
          <LoaderIcon
            v-else-if="probe.status === 'active'"
            :size="13"
            class="text-primary animate-spin"
          />
          <div v-else class="w-[13px] h-[13px] rounded-full border-[1.5px] border-border" />
          <span
            class="text-[10px] px-[6px] py-px rounded-[3px] bg-muted text-muted-foreground font-semibold uppercase tracking-wide font-mono shrink-0"
          >{{ probe.label }}</span>
          <span
            class="flex-1 font-mono text-[11.5px] truncate"
            :class="
              probe.status === 'miss'
                ? 'text-muted-foreground opacity-55'
                : probe.status === 'pending'
                  ? 'text-muted-foreground'
                  : 'text-foreground'
            "
          >{{ probe.path }}</span>
          <span v-if="probe.status === 'miss'" class="text-[10px] text-muted-foreground shrink-0"
            >not found</span
          >
        </div>
        <div
          v-if="probes.length === 0"
          class="px-3.5 py-4 text-[12px] text-muted-foreground text-center"
        >
          Scanning…
        </div>
      </div>

      <div class="text-center mt-4">
        <button
          class="text-[11.5px] text-muted-foreground underline bg-transparent border-none cursor-pointer font-sans hover:text-foreground transition-colors"
          @click="$emit('pick-manually')"
        >
          Pick location manually
        </button>
      </div>
    </div>
  </div>
</template>
