# 9/16 临时报告

杨振东，杨晓蓉



## 方案一：基于栅格

根据当前得到的树结构，可以得到完整的层次关系。为了让数据在不同尺度下显示，需要将满足特定条 件的邻近结点合并为一个新的结点。

对于方案一，有两个核心的问题待解决。

 1. 算法模型层面 如何得到一个树的目标切割？树的切割即剪枝，可分为前和后两种方法。按照陈老师的说明，这两种方法都属于树结构的自底向上生成模式，即决定怎样的一棵子树由一个根节点可表。具体区别如下：

     	1. 前者的意图在于，当一个结点不位于最底层时，它有继续分裂或停留在该层级两种选择。目 标算法模型需要决定在这种情况下，这个结点应不应该分裂产生子节点，即需不需要在这个 位置进行剪枝。
          	2. 后者的意图在于，对于一个已经生成且初始叶子节点都位于最底层的树，判断在一个仅有同 层叶子节点的同胞结构（即不含根节点的两层子树结构）中，这些同胞节点（对于二叉树而 言，即左右子节点）是否满足一定的条件，让它们可以直接由它们的父节点表达。在决策结 束后，再返回上一层继续判断，直到没有这样的结构可以向上收缩为止。<small>在深度学习领域， 有一个经典的剪枝算法 Dropout 即是基于这个思路：对整体网络的输出目标进行评估，测试 移除网络中一个神经元，观察结果的变化，若新的结果在允许误差范围内，即可以去掉该结点。</small>

    这两个方向可以分别归纳为以一个 / 多个结点为模型输入，以布尔类型为最终输出的算法设计目 标。它们的中心问题包括：

    + 对于前者，如何确定一个结点已经足够表达我们需要看到的信息？如果使用神经网络，即默 认这个问题的解可以表达为该结点的信息的线性组合？对于后者，如何确定一组同胞结点能 够或需要收缩到父节点，是否能够构造一个目标函数使得同时能满足视觉信息获取效率的提 高和视觉信息表达的减少（**尺度效应**）相平衡？
    + 怎样确定上述目标中，应该怎样选取一组固定长度的向量作为模型的输入？对于一个结点， 最直观的信息为其中所含的数据点的列表和对应的统计分布，这些信息足够么？
    + 这样构建出来的模型是否有足够强大的鲁棒性？如果是，它的可解释性如何？对应地，应当 找到解释其原理的方法，同时可以注意到上一条中确定的各项参数对模型输出的影响相关性 有多高，是不是存在可以去掉的参数？如果存在，当模型的输入变得简单后，应该质疑当前 模型是否仅由简单的一个目标函数就可以完成决策，而不需要构建当前的模型？模型的实用 性和必要性是否因此大打折扣？

	2. 可视化设计层面 当前对于栅格式的数据，一般以封闭矩形表示对应范围，以一维的信息（如颜色映射）来表征一个 额外维度的信息（多为统计信息，如所含点的数量、所含点的值的中位数、所含点的值的平均 数）。当我们在粒度不变的情况下，使用上层节点，即原先多个栅格的集合表示一个集合数据的时 候，又需要怎样去表示，以达到较多的视觉信息表达？



## 方案二：基于图像

栅格化的数据，基于上文提到的可视化表示方法，同样可以看做一个二维矩阵（[y 坐标 : x 坐标] => 对 应的单个值）。同时，也可以解释为一个单通道图像，相应地，进行以单通道图像为输入的模型处理。

对于方案二，有三个可参考的思路。

1. 卷积层

   构建 _输入：图像矩阵->隐含：卷积神经元(+激活?)->输出：图像矩阵_ 的网络。

   对应问题： 解释性是否高？ 如何定义目标函数？ 

2. 反卷积层

   反卷积是卷积的逆运算，常用于放大图像，构建出一定的细节，但不能还原采样后丢失的信息。在 深度学习中，反卷积层主要出现在生成模型中，通过有限的信息生成出一个完整的集合，称为生成 器。生成器的输出结果由一个含有卷积层的判别器计算出一个分类结果，以判断生成结果是否符合 目标。同时，生成器的反向传播以使判别器能够接受为目标，判别器的反向传播以能更好区分真实 数据和生成器的输出数据为目标，二者形成纳什均衡，因而整个网络结构被称为生成对抗网络。在 一些由图像生成图像的生成对抗网络中，也有输入和输出图像大小相等的情况。这是使用卷积层降 低图像大小的同时保持特征，再由特征生成一个新的图像，即 _卷积层->反卷积层_ 的结构。

   对应问题：

   + 网络构建和训练的难度很高。
   + 多个目标函数的定义都很难确定。 

   另外还有一个共同的缺点：

   ​	直接生成的图像没有依赖于额外的可视化设计，以这样的思路解决可视化问题是否合理？

对于这个方案，我们注意到**多尺度分析**作为关键词更高频地出现在图形学领域，而且相关文献多与**显著性检测**或**显著性提升**相关 _(刘老师, 0910)_ ，主要使用**卷积神经网络**，即思路 1 中设想的结构。



## 关于主题的疑问

1. 对于“**多视图**”的说明

   我们希望得到的结果（同时在算法意义和可视化意义上）应该是一份数据在一个推荐的 `最佳尺度`_(陈老师, 0910)_ 下的展示结果，还是 `各个局部最佳尺度的拼接缝合，最终生成的结果中各个位置显示尺度不同`_(陈老师&杨振东, 0910)_ ？额外地，当我们聚焦于推荐一个最佳尺度，算法方面会显得较为薄弱（？）。

2. **衡量指标**或**目标函数**

   在疑问 1 已解决的基础上，我们应当怎样去定义算法的结果，它应该被分类为一种 visual abstraction 吗？_(杨振东, 2019)_