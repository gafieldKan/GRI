<template>
  <view class="teaching-card" v-bind="$attrs">
    <view class="teaching-card-header" v-if="title">
      <text class="teaching-card-title">{{ title }}</text>
      <view class="teaching-card-extra" v-if="extra">
        <slot name="extra" />
      </view>
    </view>

    <view class="teaching-content">
      <view v-if="definition" class="content-section definition-section">
        <text class="section-title">📖 知识点</text>
        <rich-text :nodes="renderContent(definition)" class="section-text" />
      </view>

      <view v-if="formula" class="content-section formula-section">
        <text class="section-title">🧮 公式</text>
        <view class="formula-box">
          <rich-text :nodes="renderContent(formula)" class="formula-text" />
        </view>
      </view>

      <view v-if="examples && examples.length > 0" class="content-section examples-section">
        <text class="section-title">📝 示例</text>
        <view class="examples-list">
          <view v-for="(example, index) in examples" :key="index" class="example-item">
            <rich-text :nodes="renderContent(example)" class="example-text" />
          </view>
        </view>
      </view>

      <view v-if="commonMistakes && commonMistakes.length > 0" class="content-section warning-section">
        <text class="section-title">⚠️ 易错点</text>
        <view class="mistakes-list">
          <view v-for="(mistake, index) in commonMistakes" :key="index" class="mistake-item">
            <rich-text :nodes="renderContent(mistake)" class="mistake-text" />
          </view>
        </view>
      </view>

      <view v-if="relatedKnowledge && relatedKnowledge.length > 0" class="content-section related-section">
        <text class="section-title">🔗 相关知识点</text>
        <view class="related-tags">
          <view
            v-for="knowledge in relatedKnowledge"
            :key="knowledge.id || knowledge"
            class="knowledge-tag"
            :style="{ backgroundColor: (knowledge.color || 'blue') + '20', color: knowledge.color || 'blue' }"
          >
            {{ knowledge.name || knowledge }}
          </view>
        </view>
      </view>

      <view v-if="practiceQuestions && practiceQuestions.length > 0" class="content-section practice-section">
        <text class="section-title">📝 练习题</text>
        <view class="practice-list">
          <view v-for="(question, index) in practiceQuestions" :key="index" class="practice-item">
            <view class="practice-question">
              <rich-text :nodes="renderContent(question.content)" />
            </view>
            <view v-if="question.options && question.options.length > 0" class="practice-options">
              <view
                v-for="(opt, optIndex) in question.options"
                :key="optIndex"
                class="practice-option"
                :class="{ selected: question.userAnswer === opt, correct: question.showAnswer && opt === question.answer, incorrect: question.showAnswer && question.userAnswer === opt && opt !== question.answer, disabled: question.showAnswer }"
                @click="!question.showAnswer && handleAnswerSelect(index, opt)"
              >
                <text class="option-letter">{{ String.fromCharCode(65 + optIndex) }}</text>
                <text class="option-text">{{ opt }}</text>
              </view>
            </view>
            <view v-if="question.showAnswer" class="practice-answer">
              <text class="answer-label">正确答案：</text>
              <text class="answer-value">{{ question.answer }}</text>
              <view v-if="question.explanation" class="answer-explanation">
                <rich-text :nodes="renderContent(question.explanation)" />
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="card-footer" v-if="showNextButton">
      <view class="footer-content">
        <slot name="footer">
          <button class="btn btn-primary" @click="handleNext" :disabled="loading">
            {{ loading ? '处理中...' : '下一步' }}
          </button>
        </slot>
      </view>
    </view>
  </view>
</template>

<script>
import katex from 'katex'

export default {
  name: 'BaseTeachingCard',
  inheritAttrs: false,
  props: {
    title: {
      type: String,
      default: '知识点讲解',
    },
    definition: {
      type: String,
      default: '',
    },
    formula: {
      type: String,
      default: '',
    },
    examples: {
      type: Array,
      default: () => [],
    },
    commonMistakes: {
      type: Array,
      default: () => [],
    },
    relatedKnowledge: {
      type: Array,
      default: () => [],
    },
    practiceQuestions: {
      type: Array,
      default: () => [],
    },
    extra: {
      type: [String, Object, Array],
      default: null,
    },
    showNextButton: {
      type: Boolean,
      default: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['next', 'answer-select'],
  setup(props, { emit }) {
    const renderContent = (content) => {
      if (!content) return ''

      try {
        const html = content.replace(/\$(.*?)\$/g, (match, p1) => {
          try {
            return katex.renderToString(p1.trim(), {
              displayMode: false,
              throwOnError: false,
            })
          } catch (e) {
            return match
          }
        })
        return html
      } catch (e) {
        return content
      }
    }

    const handleNext = () => {
      emit('next')
    }

    const handleAnswerSelect = (questionIndex, answer) => {
      emit('answer-select', questionIndex, answer)
    }

    return {
      renderContent,
      handleNext,
      handleAnswerSelect,
    }
  },
}
</script>

<style scoped>
.teaching-card {
  background: var(--color-bg-panel, #fff);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  overflow: hidden;
}

.teaching-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.teaching-card-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
}

.teaching-card-extra {
  color: var(--color-text-secondary, #59596b);
  font-size: 13px;
}

.teaching-content {
  padding: 20px;
}

.content-section {
  margin-bottom: 24px;
}

.content-section:last-child {
  margin-bottom: 0;
}

.section-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.section-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-primary, #1a1a2e);
}

.formula-section {
  margin: 16px 0;
}

.formula-box {
  text-align: center;
  padding: 16px;
  background: var(--color-bg-base, #f5f5f5);
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border, #e8e8f0);
}

.formula-text {
  font-size: 18px;
  color: var(--color-primary, #4a6cf7);
  font-family: 'Times New Roman', serif;
}

.examples-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example-item {
  padding: 12px 16px;
  background: var(--color-bg-base, #f5f5f5);
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border, #e8e8f0);
}

.example-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #59596b);
}

.warning-section {
  background: #fffbe6;
  border: 1px solid #ffd591;
  border-radius: var(--radius-md, 10px);
  padding: 16px;
}

.mistakes-list {
  margin: 0;
  padding-left: 20px;
}

.mistake-item {
  margin-bottom: 10px;
  color: var(--color-warning, #faad14);
}

.mistake-text {
  font-size: 14px;
  color: var(--color-text-secondary, #59596b);
}

.related-section {
  margin-top: 16px;
}

.related-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.knowledge-tag {
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid currentColor;
}

.practice-section {
  margin-top: 16px;
}

.practice-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.practice-item {
  padding: 16px;
  background: var(--color-bg-base, #f5f5f5);
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border, #e8e8f0);
}

.practice-question {
  margin-bottom: 12px;
}

.practice-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.practice-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.practice-option:active {
  transform: scale(0.98);
}

.practice-option.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.practice-option.selected {
  background: var(--color-primary-light, rgba(74, 108, 247, 0.1));
  border-color: var(--color-primary, #4a6cf7);
}

.practice-option.correct {
  background: #f6ffed;
  border-color: #52c41a;
}

.practice-option.incorrect {
  background: #fff1f0;
  border-color: #ff4d4f;
}

.option-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--color-primary, #4a6cf7);
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.practice-option.correct .option-letter {
  background: #52c41a;
}

.practice-option.incorrect .option-letter {
  background: #ff4d4f;
}

.option-text {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary, #1a1a2e);
  line-height: 1.4;
}

.practice-answer {
  padding: 12px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: var(--radius-sm, 6px);
}

.answer-label {
  font-weight: 600;
  color: var(--color-success, #52c41a);
}

.answer-value {
  font-weight: 700;
  color: var(--color-text-primary, #1a1a2e);
  margin-left: 8px;
}

.answer-explanation {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #b7eb8f;
  color: var(--color-text-secondary, #59596b);
  font-size: 13px;
}

.card-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border, #e8e8f0);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.footer-content {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
}

.btn-primary:active:not(:disabled) {
  background: var(--color-primary-hover, #3b5bd9);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .teaching-card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .teaching-card-header {
    border-color: var(--color-border, #3d3d5c);
  }

  .teaching-card-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .section-title {
    color: var(--color-text-primary, #e8e8f0);
    border-color: var(--color-border, #3d3d5c);
  }

  .example-item {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .example-text {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .warning-section {
    background: rgba(250, 173, 20, 0.1);
    border-color: #665500;
  }

  .mistake-text {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .formula-box {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .formula-text {
    color: var(--color-primary, #7c94ff);
  }

  .example-item {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .example-text {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .practice-item {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .practice-option {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .practice-option.selected {
    background: rgba(124, 148, 255, 0.15);
    border-color: var(--color-primary, #7c94ff);
  }

  .practice-option.correct {
    background: rgba(82, 196, 26, 0.15);
    border-color: #52c41a;
  }

  .practice-option.incorrect {
    background: rgba(255, 77, 79, 0.15);
    border-color: #ff4d4f;
  }

  .practice-answer {
    background: rgba(82, 196, 26, 0.1);
    border-color: #52c41a;
  }

  .answer-label {
    color: var(--color-success, #95de64);
  }

  .answer-value {
    color: var(--color-text-primary, #e8e8f0);
  }

  .answer-explanation {
    border-color: #52c41a;
    color: var(--color-text-secondary, #a8a8c0);
  }

  .card-footer {
    border-color: var(--color-border, #3d3d5c);
  }

  .btn-primary {
    background: var(--color-primary, #7c94ff);
    color: #1a1a2e;
  }

  .btn-primary:active:not(:disabled) {
    background: var(--color-primary-hover, #9ab5ff);
  }

  .practice-option.correct .option-letter {
    background: #95de64;
  }

  .practice-option.incorrect .option-letter {
    background: #ff7875;
  }
}
</style>