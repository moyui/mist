import { getMarkdownContent } from '@app/prompts';
import { SystemMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable } from '@nestjs/common';
import { ApplyTemplateDto } from './dto/apply.dto';

@Injectable()
export class TemplateService {
  getPromptTemplate(name: string) {
    let template = getMarkdownContent(name);
    // 转义花括号：将 { 替换为 {{，将 } 替换为 }}
    template = template.replace('{', '{{').replace('}', '}}');
    // 使用正则表达式将 <<VAR>> 替换为 {VAR}
    template = template.replace(/<<([^>>]+)>>/g, '{$1}');
    return template;
  }

  async applyPromptTemplate(applyTemplateDto: ApplyTemplateDto) {
    const systemPrompt = await new PromptTemplate({
      inputVariables: ['CURRENT_TIME'],
      template: this.getPromptTemplate(applyTemplateDto.name),
    }).format({ CURRENT_TIME: Date.now() });

    return [
      new SystemMessage(systemPrompt),
      ...applyTemplateDto.state['messages'],
    ];
  }
}
