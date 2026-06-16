import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessController } from './business.controller';
import { BranchController } from './branch.controller';
import { BusinessService } from './business.service';
import { BranchService } from './branch.service';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController, BranchController],
  providers: [BusinessService, BranchService],
  exports: [BusinessService, BranchService],
})
export class BusinessModule {}
