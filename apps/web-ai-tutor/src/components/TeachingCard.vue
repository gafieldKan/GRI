<template>
  <base-teaching-card
    v-bind="$attrs"
    :title="title"
    :definition="definition"
    :formula="formula"
    :examples="examples"
    :common-mistakes="commonMistakes"
    @next="handleNext"
  />
</template>

<script>
import BaseTeachingCard from '@/components/base/BaseTeachingCard.vue'

export default {
  name: 'TeachingCard',
  components: {
    BaseTeachingCard
  },
  inheritAttrs: false,
  props: {
    title: {
      type: String,
      default: '知识点讲解'
    },
    definition: {
      type: String,
      default: ''
    },
    formula: {
      type: String,
      default: ''
    },
    examples: {
      type: Array,
      default: () => []
    },
    commonMistakes: {
      type: Array,
      default: () => []
    }
  },
  emits: ['next'],
  setup(props, { emit }) {
    const handleNext = () => {
      emit('next')
    }

    return {
      handleNext
    }
  }
}
</script>

<style scoped>
/* Wrapper passes all styles to BaseTeachingCard */
</style>